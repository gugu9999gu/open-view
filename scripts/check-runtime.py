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
    source_file = ROOT / 'examples/runtime-app/src/main.jsx'
    original_source = source_file.read_text()
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
            errors, runtime_requests = [], []
            ui.on('request', lambda request: runtime_requests.append(request.url) if request.method == 'GET' and '/api/traces' in request.url else None)
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
            historical = None
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
                mappings=detail['sourceGraph']['mappings']
                required=['Save customer','handleSaveCustomer','createCustomer']
                if scenario=='fixture': required.append('returnFixture')
                if scenario=='after-commit': required.append('invalidateCustomerCache')
                for label in required:
                    span=next(event for event in detail['events'] if event['name']==label)
                    match=next(item for item in mappings if item['spanId']==span['spanId'])
                    assert match['status']=='linked', (label, match)
                if scenario=='success': historical=detail
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
            # Exact runtime refs must match the independently scanned original source definitions.
            static_graph=await api('/api/graph')
            definitions={node['id']:node for node in static_graph['nodes'] if node['kind']=='function'}
            for node in historical['sourceGraph']['nodes']:
                assert node['id'] in definitions
                assert node['sourceRef']['moduleVersion']==definitions[node['id']]['sourceRef']['moduleVersion']
                assert node['sourceRef']['start']==definitions[node['id']]['sourceRef']['start']
            report['checks'].append('browser and Node manifest refs exactly match independently scanned AST definitions')
            await expect(ui.get_by_role('region',name='실행 소스 그래프')).to_be_visible()
            await ui.locator('.source-node').filter(has_text='handleSaveCustomer').click()
            await expect(ui.locator('.source-code')).to_contain_text("handler.fetch('/api/customers'")
            await expect(ui.locator('.source-node.observed.selected')).to_have_count(1)
            await expect(ui.get_by_role('region',name='실행 당시 소스')).to_contain_text('src/main.jsx:')
            report['checks'].append('OBSERVED graph highlights verified nodes and opens original code without DEMO/current-source substitution')
            # No browser route interception or transport replacements: observe real UI GETs and actual saves.
            selected_id = await ui.locator('.runtime-detail').get_attribute('data-selected')
            selected_code = await ui.locator('.source-code').inner_text()
            await ui.evaluate('window.__retainedSourceForTest = document.querySelector(".source-code")')
            await page.get_by_label('예제 이름').fill(prefix+'-live')
            await page.get_by_role('button',name='저장',exact=True).click(); actions+=1
            await ui.bring_to_front()
            await expect(ui.locator('.runtime-trace').filter(has_text='Save customer')).to_have_count(actions, timeout=10000)
            assert await db_count(prefix+'-live') == 1
            assert await ui.locator('.runtime-detail').get_attribute('data-selected') == selected_id
            await expect(ui.locator('.source-code')).to_have_text(selected_code)
            await ui.evaluate('window.__retainedSourceForTest = document.querySelector(".source-code")')
            await asyncio.sleep(1.3)
            assert await ui.evaluate('window.__retainedSourceForTest === document.querySelector(".source-code")')
            report['checks'].append('automatic real HTTP refresh shows new saved action without resetting selected trace or source DOM')
            await ui.get_by_role('button',name='자동 갱신 중지',exact=True).click()
            await asyncio.sleep(.2)
            stopped_count = len(runtime_requests)
            paused_success = await page.locator('li[data-scenario="success"][data-ok="true"]').count()
            await page.get_by_label('예제 이름').fill(prefix+'-paused')
            await page.get_by_role('button',name='저장',exact=True).click(); actions+=1
            await expect(page.locator('li[data-scenario="success"][data-ok="true"]')).to_have_count(paused_success+1)
            await ui.bring_to_front(); await asyncio.sleep(1.3)
            assert len(runtime_requests) == stopped_count
            assert await db_count(prefix+'-paused') == 1
            await expect(ui.locator('.runtime-trace').filter(has_text='Save customer')).to_have_count(actions-1)
            report['checks'].append('pause stops UI GETs while the actual application and PostgreSQL save continue')
            await ui.get_by_role('button',name='새로고침',exact=True).click()
            await expect(ui.locator('.runtime-trace').filter(has_text='Save customer')).to_have_count(actions, timeout=10000)
            await expect(ui.locator('.runtime-detail')).to_have_attribute('data-selected',selected_id)
            await expect(ui.locator('.source-code')).to_have_text(selected_code)
            await asyncio.sleep(.2); manual_count = len(runtime_requests); await asyncio.sleep(1.3)
            assert len(runtime_requests) == manual_count
            report['checks'].append('manual refresh remains one-shot while paused and preserves selected historical code')
            await ui.get_by_role('button',name='자동 갱신 시작',exact=True).click()
            await asyncio.sleep(.2); resumed_count = len(runtime_requests); await asyncio.sleep(1.3)
            assert len(runtime_requests) > resumed_count
            report['checks'].append('automatic polling resumes after explicit restart')
            await ui.screenshot(path=str(OUT/'observed-runtime.png'),full_page=True)
            await page.screenshot(path=str(OUT/'react-example.png'),full_page=True)
            await ui.locator('[data-view="graph"]').click()
            await expect(ui.locator('#inspector')).to_be_visible()
            await asyncio.sleep(.2); inactive_count = len(runtime_requests); await asyncio.sleep(1.3)
            assert len(runtime_requests) == inactive_count
            report['checks'].append('leaving OBSERVED aborts and stops automatic UI requests')
            await ui.locator('[data-view="runtime"]').click()
            report['checks'].append('OBSERVED UI displays actual spans and hides unrelated DEMO/STATIC panels')
            assert not await context.cookies()
            bootstrap=await page.evaluate("async()=>{const r=await fetch('/__open_view/bootstrap');return r.json();}")
            assert 'token' not in bootstrap and 'relaySession' in bootstrap
            denied=await ui.evaluate("""async token => (await fetch('/api/traces',{headers:{Authorization:'Bearer '+token}})).status""",bootstrap['relaySession'])
            assert denied==401
            report['checks'].append('no auth cookies; browser relay token cannot read UI data')
            old_event=next(event for event in historical['events'] if event['name']=='handleSaveCustomer')
            old_ref=old_event['source']
            old_path='/api/sources/'+old_ref['manifestId']+'/'+old_ref['definitionId']
            old_source=await api(old_path)
            assert 'HMR_REVISION_TWO' not in old_source['code']
            before={trace['traceId'] for trace in await action_traces()}
            async with page.expect_event('load',timeout=20000):
                source_file.write_text(original_source.replace('const response = await handler.fetch', '/* HMR_REVISION_TWO */ const response = await handler.fetch'))
            await page.get_by_label('예제 이름').fill(prefix+'-hmr')
            await page.get_by_role('button',name='저장',exact=True).click();actions+=1
            details=await wait_actions(actions)
            current=next(trace for trace in details if trace['traceId'] not in before)
            current_event=next(event for event in current['events'] if event['name']=='handleSaveCustomer')
            current_ref=current_event['source']
            assert current_event['buildId'] != old_event['buildId']
            assert current_ref['manifestId'] != old_ref['manifestId'] and current_ref['definitionId'] != old_ref['definitionId']
            assert any(item['spanId']==current_event['spanId'] and item['status']=='linked' for item in current['sourceGraph']['mappings'])
            assert old_source==await api(old_path)
            new_source=await api('/api/sources/'+current_ref['manifestId']+'/'+current_ref['definitionId'])
            assert 'HMR_REVISION_TWO' in new_source['code']
            historical_again=await api('/api/traces/'+historical['traceId'])
            assert historical_again['sourceGraph']['nodes']==historical['sourceGraph']['nodes']
            assert await db_count(prefix+'-hmr')==1
            report['checks'].append('real Vite HMR: new build and source IDs, old trace and callback bytes remain immutable')
            await ui.get_by_role('button',name='새로고침',exact=True).click()
            await ui.locator('.runtime-trace[data-trace-id="'+current['traceId']+'"]').click()
            await ui.locator('.source-node').filter(has_text='handleSaveCustomer').click()
            await expect(ui.locator('.source-code')).to_contain_text('HMR_REVISION_TWO')
            await ui.locator('.runtime-trace[data-trace-id="'+historical['traceId']+'"]').click()
            await ui.locator('.source-node').filter(has_text='handleSaveCustomer').click()
            await expect(ui.locator('.source-code')).not_to_contain_text('HMR_REVISION_TWO')
            await expect(ui.locator('.source-code')).to_contain_text("handler.fetch('/api/customers'")
            await ui.screenshot(path=str(OUT/'historical-source.png'),full_page=True)
            report['checks'].append('historical graph selection displays old source after real HMR, never the current file')
            # Source history is an authenticated UI surface, not readable by the page relay token.
            denied_source=await ui.evaluate("""async ({path,token}) => (await fetch(path,{headers:{Authorization:'Bearer '+token}})).status""",{'path':old_path,'token':bootstrap['relaySession']})
            assert denied_source==401
            report['checks'].append('source history is inaccessible with browser relay credentials')
            async def accept_delete(dialog):
                await dialog.accept()
            ui.once('dialog', accept_delete)
            await ui.get_by_role('button',name='보관 기록 삭제',exact=True).click()
            await expect(ui.locator('.runtime-trace')).to_have_count(0)
            await expect(ui.locator('.source-code')).to_have_count(0)
            await expect(ui.locator('.runtime-detail')).to_contain_text('삭제했습니다')
            await asyncio.sleep(1.3)
            await expect(ui.locator('.runtime-trace')).to_have_count(0)
            report['checks'].append('confirmed deletion clears traces and source without stale polling responses restoring them')
            # Revoke the real session server-side; do not click logout or mock a 401 response.
            session = await ui.evaluate('JSON.parse(sessionStorage.getItem("open-view.ui-session.v1"))')
            revoked = await context.request.delete(ready['loginUrl'].split('/#')[0]+'/api/session', headers={'Authorization':'Bearer '+session['accessToken']})
            assert revoked.status == 204
            await expect(ui.locator('.runtime-sync')).to_contain_text('인증 필요', timeout=10000)
            await asyncio.sleep(.2); denied_count = len(runtime_requests); await asyncio.sleep(1.3)
            assert len(runtime_requests) == denied_count
            await expect(ui.locator('.runtime-trace')).to_have_count(0)
            await expect(ui.locator('.source-code')).to_have_count(0)
            report['checks'].append('real session revocation stops retries and clears sensitive observed/source data')
            before_success=await page.locator('li[data-scenario="success"][data-ok="true"]').count()
            server.stdin.write(b'stop-collector\n');await server.stdin.drain()
            await ready_line('OPEN_VIEW_COLLECTOR_STOPPED')
            await page.get_by_label('예제 이름').fill(prefix+'-collector-offline')
            await page.get_by_role('button',name='저장',exact=True).click()
            await expect(page.locator('li[data-scenario="success"][data-ok="true"]')).to_have_count(before_success+1)
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
        source_file.write_text(original_source)
        # Remove only this run's generated records. Never clear the whole example table.
        if os.environ.get('OPEN_VIEW_EXAMPLE_DATABASE_URL'):
            script="import pg from 'pg';const p=new pg.Pool({connectionString:process.env.OPEN_VIEW_EXAMPLE_DATABASE_URL});try{await p.query('DELETE FROM open_view_runtime_examples WHERE name LIKE $1',[process.argv[1]+'%']);}finally{await p.end();}"
            cleanup=await asyncio.create_subprocess_exec('node','--input-type=module','-e',script,prefix,cwd=ROOT,stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL)
            await cleanup.wait()
        (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(report,ensure_ascii=False))

asyncio.run(main())
