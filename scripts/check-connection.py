"""Black-box package-consumer E2E. Actual npm tarball, external root, Vite, browser, API and source history.
The generated consumer is NOT a user's real business project. No browser request mocks.
"""
import asyncio
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from playwright.async_api import async_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'connection-e2e'

async def run(*args, cwd, timeout=120):
    process = await asyncio.create_subprocess_exec(*map(str,args), cwd=cwd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await asyncio.wait_for(process.communicate(),timeout)
    if process.returncode: raise RuntimeError(f'{args[0]} exited {process.returncode}: '+err.decode()[-2000:])
    return out.decode()

async def main():
    OUT.mkdir(parents=True,exist_ok=True)
    report={'scope':'generated-external-package-consumer-not-user-project','commit':os.environ.get('GITHUB_SHA'),'status':'failed','checks':[]}
    server=browser=None
    with tempfile.TemporaryDirectory(prefix='open view consumer ') as temp:
        app=Path(temp);(app/'src').mkdir()
        try:
            pack=json.loads(await run('npm','pack','--ignore-scripts','--json','--pack-destination',OUT,cwd=ROOT))[0]
            report['packageFiles']=len(pack['files'])
            assert all(not f['path'].startswith(('test/','examples/','.leerness/','artifacts/')) for f in pack['files'])
            (app/'package.json').write_text(json.dumps({'name':'independent-open-view-consumer','private':True,'type':'module','scripts':{'dev':'vite','build':'vite build'},'dependencies':{'vite':'7.3.7','react':'19.3.1','react-dom':'19.3.1'}}))
            await run('npm','install','--ignore-scripts','--no-audit','--no-fund','--save-exact',OUT/pack['filename'],cwd=app)
            await run('npm','ci','--ignore-scripts','--no-audit','--no-fund',cwd=app)
            cli=app/'node_modules/open-view/onboarding/cli.mjs'
            assert cli.exists() and (app/'node_modules/.bin/open-view').exists()
            report['checks'].append('actual npm pack install + consumer npm ci + executable bin outside repository')
            (app/'index.html').write_text('<html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>')
            source="""import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {traceAction} from 'open-view/browser';
import {unselected} from './other.jsx';
function App(){const [count,setCount]=useState(0);const [failure,setFailure]=useState('');
async function save(){await traceAction('External Save',async action=>action.span('externalHandler',async handler=>{
  /* HISTORICAL_SOURCE_A */ const response=await handler.fetch('/api/items',{method:'POST'});setCount((await response.json()).count);
}));}
async function fail(){try{await traceAction('External Failure',async action=>{const r=await action.fetch('/api/fail');if(!r.ok)throw new Error('business-error');});}catch(error){setFailure(error.message);}}
return <main><h1>Independent consumer</h1><button onClick={save}>Save external</button><button onClick={unselected}>Unselected callback</button><button onClick={fail}>Fail external</button><output aria-label="count">{count}</output><p aria-label="failure">{failure}</p></main>;}
createRoot(document.getElementById('root')).render(<App/>);"""
            (app/'src/main.jsx').write_text(source)
            (app/'src/other.jsx').write_text("import {traceAction} from 'open-view/browser';export const unselected=()=>traceAction('Unselected',async action=>action.fetch('/api/ping'));")
            (app/'.env').write_text('PRIVATE_SENTINEL=do-not-collect-env-value\n')
            (app/'vite.config.mjs').write_text("""import fs from 'node:fs';
fs.writeFileSync(new URL('./config-executed.txt',import.meta.url),'executed');
export default {server:{host:'127.0.0.1'},build:{sourcemap:false},plugins:[{name:'existing-api',configureServer(server){
 let count=0;
 server.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/api/'))return next();
 const observer=server.config.plugins.find(p=>p.name==='open-view-project-connector');
 const work=async()=>{if(req.url==='/api/items'&&req.method==='POST')count++;res.writeHead(req.url==='/api/fail'?500:200,{'Content-Type':'application/json'});res.end(JSON.stringify({count,ok:req.url!=='/api/fail'}));};
 if(observer)await observer.api.tracer.request('consumer API',req.headers.traceparent,work);else await work();
 });}}]};""")
            files=['package.json','package-lock.json','vite.config.mjs','index.html','src/main.jsx','src/other.jsx','.env']
            original={name:(app/name).read_bytes() for name in files}
            preview=json.loads(await run('node',cli,'init','--source','src/main.jsx',cwd=app))
            assert not preview['written'] and not (app/'open-view.config.json').exists()
            await run('node',cli,'init','--source','src/main.jsx','--write',cwd=app)
            config=json.loads((app/'open-view.config.json').read_text());config.update(uiPort=0,appPort=0)
            (app/'open-view.config.json').write_text(json.dumps(config))
            report['checks'].append('init preview performs no writes; explicit init creates only reviewed JSON')
            doctor=json.loads(await run('node',cli,'doctor','--json',cwd=app))
            assert doctor['status']=='ready-with-limitations' and not doctor['configurationExecuted']
            assert not (app/'config-executed.txt').exists() and 'do-not-collect-env-value' not in json.dumps(doctor)
            (OUT/'doctor.json').write_text(json.dumps(doctor,indent=2))
            report['checks'].append('doctor checks metadata and selected AST without executing Vite config or exposing .env')
            # Normal production build without injection resolves public browser entry to no-op.
            await run('npm','run','build',cwd=app)
            markers=['__open_view','relaySession','runtimeInstanceId','traceparent','api/ingest','manifestId','definitionId','moduleVersion']
            production=list((app/'dist').rglob('*'));checked=0
            for file in production:
                if not file.is_file():continue
                assert file.suffix!='.map'
                content=file.read_text();assert not any(marker in content for marker in markers)
                checked+=1
            report['checks'].append(f'unchanged consumer production build: {checked} files, no development markers or maps')
            server=await asyncio.create_subprocess_exec('node',cli,'dev','--trust-project',cwd=app,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
            async def ready_line(prefix):
                for _ in range(100):
                    line=await asyncio.wait_for(server.stdout.readline(),25)
                    if not line:
                        err=await server.stderr.read();raise RuntimeError('Connector stopped: '+err.decode()[-1500:])
                    value=line.decode().strip()
                    if value.startswith(prefix):return value[len(prefix):]
                raise RuntimeError('Missing readiness marker')
            ready=json.loads(await ready_line('OPEN_VIEW_CONNECTED='))
            assert (app/'config-executed.txt').exists()
            async with async_playwright() as playwright:
                browser=await playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True)
                context=await browser.new_context(viewport={'width':1920,'height':1200})
                ui=await context.new_page();page=await context.new_page();errors=[]
                for target in [ui,page]:target.on('pageerror',lambda error:errors.append(str(error)))
                await ui.goto(ready['loginUrl']);await ui.wait_for_function("sessionStorage.getItem('open-view.ui-session.v1')!==null")
                await page.goto(ready['appUrl']);await expect(page.get_by_role('button',name='Save external')).to_be_visible()
                async def api(endpoint):
                    return await ui.evaluate("""async p=>{const s=JSON.parse(sessionStorage.getItem('open-view.ui-session.v1'));const r=await fetch(p,{credentials:'omit',headers:{Authorization:'Bearer '+s.accessToken}});if(!r.ok)throw new Error('API '+r.status);return r.json();}""",endpoint)
                async def wait_trace(name,after=None):
                    for _ in range(100):
                        traces=(await api('/api/traces'))['traces']
                        for summary in traces:
                            if summary['name']==name and summary['traceId']!=after:
                                detail=await api('/api/traces/'+summary['traceId'])
                                if any(e['kind']=='http.server' for e in detail['events']):return detail
                        await asyncio.sleep(.1)
                    raise AssertionError('Actual trace not received: '+name)
                await page.get_by_role('button',name='Save external').click();await expect(page.get_by_label('count')).to_have_text('1')
                old=await wait_trace('External Save')
                assert {'action','function','http.client','http.server'}.issubset({e['kind'] for e in old['events']})
                assert not old['coverage']['missingParents']
                event=next(e for e in old['events'] if e['name']=='externalHandler');ref=event['source']
                endpoint='/api/sources/'+ref['manifestId']+'/'+ref['definitionId'];old_source=await api(endpoint)
                assert 'HISTORICAL_SOURCE_A' in old_source['code']
                static=await api('/api/graph');assert ref['definitionId'] in {n['id'] for n in static['nodes']}
                report['checks'].append('real external click -> existing API -> observed parent chain -> independently scanned source')
                await page.get_by_role('button',name='Unselected callback').click();other=await wait_trace('Unselected')
                assert next(e for e in other['events'] if e['kind']=='action')['source'] is None
                report['checks'].append('non-selected module runs but is not falsely source-mapped')
                await page.get_by_role('button',name='Fail external').click();await expect(page.get_by_label('failure')).to_have_text('business-error')
                failed=await wait_trace('External Failure');assert any(e['kind']=='action' and e['status']=='error' for e in failed['events'])
                report['checks'].append('existing business error and HTTP semantics preserved')
                denied=await context.request.get(ready['appUrl']+'/__open_view/bootstrap',headers={'Origin':'https://untrusted.invalid'})
                assert denied.status==403 and not await context.cookies()
                bootstrap=await page.evaluate("async()=>fetch('/__open_view/bootstrap').then(r=>r.json())")
                denied=await context.request.get(ready['uiUrl']+endpoint,headers={'Authorization':'Bearer '+bootstrap['relaySession']})
                assert denied.status==401 and 'token' not in bootstrap
                report['checks'].append('cross-origin relay denied; page relay cannot read UI/source; no authentication cookies')
                async with page.expect_event('load',timeout=20000):
                    (app/'src/main.jsx').write_text(source.replace('HISTORICAL_SOURCE_A','CURRENT_SOURCE_B'))
                await page.get_by_role('button',name='Save external').click();await expect(page.get_by_label('count')).to_have_text('2')
                new=await wait_trace('External Save',old['traceId']);new_event=next(e for e in new['events'] if e['name']=='externalHandler')
                assert new_event['source']['manifestId']!=ref['manifestId'] and new_event['buildId']!=event['buildId']
                assert old_source==await api(endpoint)
                report['checks'].append('external Vite file change: new build/source IDs and immutable historical callback')
                await ui.locator('[data-view="runtime"]').click()
                await ui.locator('.runtime-trace[data-trace-id="'+old['traceId']+'"]').click()
                await ui.locator('.source-node').filter(has_text='externalHandler').click()
                await expect(ui.locator('.source-code')).to_contain_text('HISTORICAL_SOURCE_A')
                await expect(ui.locator('.source-code')).not_to_contain_text('CURRENT_SOURCE_B')
                await ui.screenshot(path=str(OUT/'external-historical-source.png'),full_page=True)
                report['checks'].append('external historical source displayed in authenticated OBSERVED graph')
                server.stdin.write(b'stop-collector\n');await server.stdin.drain();await ready_line('OPEN_VIEW_COLLECTOR_STOPPED')
                await page.get_by_role('button',name='Save external').click();await expect(page.get_by_label('count')).to_have_text('3')
                report['checks'].append('collector stopped while existing consumer API still handles saves')
                assert not errors,errors
                await browser.close();browser=None
            server.terminate();await asyncio.wait_for(server.wait(),15)
            assert server.returncode in [0,-15,143],server.returncode
            server=None
            (app/'src/main.jsx').write_text(source)
            assert all((app/name).read_bytes()==data for name,data in original.items())
            report['checks'].append('clean process termination and consumer source/config/package/lock/.env bytes unchanged')
            report['status']='passed';report['passed']=len(report['checks'])
        except Exception as error:
            report['error']=type(error).__name__+': '+re.sub(r'token=[a-f0-9]+','token=[REDACTED]',str(error));raise
        finally:
            if browser:await browser.close()
            if server and server.returncode is None:
                server.terminate()
                try:await asyncio.wait_for(server.wait(),10)
                except asyncio.TimeoutError:server.kill();await server.wait()
            (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':asyncio.run(main())
