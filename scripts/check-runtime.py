"""Actual React browser -> Vite -> Node -> PostgreSQL -> collector -> Open View UI.
No network mocks. Database state is cross-checked through an independent pg client.
"""
import asyncio
import json
import os
import re
import uuid
from pathlib import Path
from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'runtime-e2e'

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'scope': 'real-react-vite-postgresql-browser-e2e', 'commit': os.environ.get('GITHUB_SHA'), 'status': 'failed', 'checks': []}
    server = browser = None
    prefix = 'browser-' + uuid.uuid4().hex
    async def db_count(name):
        script = "import pg from 'pg'; const p=new pg.Pool({connectionString:process.env.OPEN_VIEW_EXAMPLE_DATABASE_URL});try{const r=await p.query('SELECT COUNT(*)::int AS count FROM open_view_runtime_examples WHERE name=$1',[process.argv[1]]);console.log(r.rows[0].count);}finally{await p.end();}"
        process = await asyncio.create_subprocess_exec('node','--input-type=module','-e',script,name,cwd=ROOT,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await asyncio.wait_for(process.communicate(),10)
        if process.returncode: raise RuntimeError('Independent DB check failed')
        return int(stdout.decode().strip())
    try:
        if not os.environ.get('OPEN_VIEW_EXAMPLE_DATABASE_URL'): raise RuntimeError('A real PostgreSQL database is required')
        env = dict(os.environ, OPEN_VIEW_UI_PORT='0', OPEN_VIEW_APP_PORT='0')
        server = await asyncio.create_subprocess_exec('node','scripts/runtime-example.mjs',cwd=ROOT,env=env,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        async def ready_line(prefix):
            for _ in range(100):
                line = await asyncio.wait_for(server.stdout.readline(),20)
                if not line: raise RuntimeError('Runtime example stopped before ready')
                value = line.decode().strip()
                if value.startswith(prefix): return value[len(prefix):]
            raise RuntimeError('Readiness marker missing')
        ready = json.loads(await ready_line('OPEN_VIEW_READY='))
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True)
            context = await browser.new_context(viewport={'width':1920,'height':1200})
            ui, page = await context.new_page(), await context.new_page()
            errors = []
            for target in [ui,page]: target.on('pageerror',lambda error: errors.append(str(error)))
            await ui.goto(ready['loginUrl'])
            await ui.wait_for_function("sessionStorage.getItem('open-view.ui-session.v1') !== null")
            await page.goto(ready['appUrl'])
            await expect(page.get_by_role('button',name='저장',exact=True)).to_be_visible()
            report['checks'].append('real React application and UI login')
            async def api(path):
                return await ui.evaluate("""async path => { const session=JSON.parse(sessionStorage.getItem('open-view.ui-session.v1'));const response=await fetch(path,{headers:{Authorization:'Bearer '+session.accessToken},credentials:'omit'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json(); }""",path)
            async def action_traces():
                data = await api('/api/traces')
                return [trace for trace in data['traces'] if trace['name']=='Save customer']
            async def wait_actions(count):
                for _ in range(100):
                    traces = await action_traces()
                    if len(traces)>=count:
                        complete=[]
                        for trace in traces:
                            detail=await api('/api/traces/'+trace['traceId'])
                            if any(event['kind']=='db.transaction' for event in detail['events']): complete.append(detail)
                        if len(complete)>=count: return complete
                    await asyncio.sleep(.1)
                raise AssertionError('Complete observed action traces were not received')
            actions=0
            for scenario in ['success','rollback','after-commit','fixture']:
                name=prefix+'-'+scenario
                await page.get_by_label('예제 이름').fill(name)
                await page.get_by_label('실행 시나리오').select_option(scenario)
                before={trace['traceId'] for trace in await action_traces()}
                await page.get_by_role('button',name='저장',exact=True).click()
                actions+=1
                details=await wait_actions(actions)
                detail=next(trace for trace in details if trace['traceId'] not in before)
                tx=next(event for event in detail['events'] if event['kind']=='db.transaction')
                committed=scenario in ['success','after-commit']
                assert tx['outcome']['transaction']==('committed' if committed else 'rolled-back')
                assert detail['coverage']['missingParents']==[]
                assert await db_count(name)==(1 if committed else 0)
                assert prefix not in json.dumps(detail)
                assert set(['action','function','http.client','http.server','db.query','db.transaction']).issubset({event['kind'] for event in detail['events']})
                if scenario=='fixture': assert any(event['kind']=='fallback' and event['outcome']['dataOrigin']=='fixture' for event in detail['events'])
                if scenario=='after-commit': assert any(event['name']=='createCustomer' and event['outcome']['business']=='failed' for event in detail['events'])
                report['checks'].append('real click + independent DB + trace: '+scenario)
            await page.get_by_label('실행 시나리오').select_option('success')
            await page.get_by_label('예제 이름').fill(prefix+'-concurrent')
            before={trace['traceId'] for trace in await action_traces()}
            await page.get_by_role('button',name='저장',exact=True).dblclick()
            actions+=2
            details=await wait_actions(actions)
            concurrent=[trace for trace in details if trace['traceId'] not in before]
            assert len(concurrent)==2 and len({trace['traceId'] for trace in concurrent})==2
            assert all(sum(event['kind']=='action' for event in trace['events'])==1 for trace in concurrent)
            assert await db_count(prefix+'-concurrent')==2
            report['checks'].append('concurrent real clicks are separate traces')
            other=await context.new_page();await other.goto(ready['appUrl'])
            await other.get_by_label('예제 이름').fill(prefix+'-other-tab')
            await other.get_by_role('button',name='저장',exact=True).click();actions+=1
            details=await wait_actions(actions)
            page_ids={event['pageInstanceId'] for trace in details for event in trace['events'] if event['kind']=='action'}
            assert len(page_ids)==2
            report['checks'].append('two browser tabs have separate page/runtime identities')
            await page.get_by_role('button',name='독립 polling 요청').click()
            for _ in range(50):
                traces=(await api('/api/traces'))['traces']
                polls=[trace for trace in traces if trace['name']=='poll']
                if polls: break
                await asyncio.sleep(.1)
            assert polls and all(trace['traceId'] not in {action['traceId'] for action in details} for trace in polls)
            report['checks'].append('polling is not attached to a previous click')
            await ui.locator('[data-view="runtime"]').click()
            await expect(ui.locator('.runtime-trace').first).to_be_visible()
            # Select an action, not the standalone poll.
            await ui.locator('.runtime-trace').filter(has_text='Save customer').first.click()
            await expect(ui.get_by_role('table',name='관측 span')).to_be_visible()
            await expect(ui.locator('.runtime-detail')).to_contain_text('BEST-EFFORT')
            await expect(ui.locator('.runtime-detail')).to_contain_text('PostgreSQL transaction')
            await expect(ui.locator('#inspector')).to_be_hidden()
            await expect(ui.locator('#routeNav')).to_be_hidden()
            await expect(ui.locator('.project-title')).to_be_hidden()
            await ui.screenshot(path=str(OUT/'observed-runtime.png'),full_page=True)
            await page.screenshot(path=str(OUT/'react-example.png'),full_page=True)
            await ui.locator('[data-view="graph"]').click()
            await expect(ui.locator('#inspector')).to_be_visible()
            await ui.locator('[data-view="runtime"]').click()
            report['checks'].append('OBSERVED UI displays actual spans and hides unrelated DEMO/STATIC panels')
            assert not await context.cookies()
            bootstrap=await page.evaluate("async()=>{const r=await fetch('/__open_view/bootstrap');return r.json();}")
            assert 'token' not in bootstrap and 'relaySession' in bootstrap
            denied=await ui.evaluate("""async token => (await fetch('/api/traces',{headers:{Authorization:'Bearer '+token}})).status""",bootstrap['relaySession'])
            assert denied==401
            report['checks'].append('no auth cookies; browser relay token cannot read UI data')
            server.stdin.write(b'stop-collector\n');await server.stdin.drain()
            await ready_line('OPEN_VIEW_COLLECTOR_STOPPED')
            await page.get_by_label('예제 이름').fill(prefix+'-collector-offline')
            await page.get_by_role('button',name='저장',exact=True).click()
            await expect(page.locator('li[data-scenario="success"][data-ok="true"]')).to_have_count(4)
            assert await db_count(prefix+'-collector-offline')==1
            report['checks'].append('collector stopped: browser and actual DB save still succeed')
            assert not errors, errors
            report['checks'].append('no uncaught browser exceptions')
            report['status']='passed';report['passed']=len(report['checks'])
    except Exception as error:
        report['error']=type(error).__name__+': '+re.sub(r'token=[a-f0-9]+','token=[REDACTED]',str(error))
        raise
    finally:
        if browser: await browser.close()
        if server and server.returncode is None:
            server.terminate()
            try: await asyncio.wait_for(server.wait(),10)
            except asyncio.TimeoutError: server.kill();await server.wait()
        # Remove only this run's generated records. Never clear the whole example table.
        if os.environ.get('OPEN_VIEW_EXAMPLE_DATABASE_URL'):
            script="import pg from 'pg';const p=new pg.Pool({connectionString:process.env.OPEN_VIEW_EXAMPLE_DATABASE_URL});try{await p.query('DELETE FROM open_view_runtime_examples WHERE name LIKE $1',[process.argv[1]+'%']);}finally{await p.end();}"
            cleanup=await asyncio.create_subprocess_exec('node','--input-type=module','-e',script,prefix,cwd=ROOT,stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL)
            await cleanup.wait()
        (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(report,ensure_ascii=False))

asyncio.run(main())
