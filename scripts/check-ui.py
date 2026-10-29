"""Local validation. Requires Python playwright and a Chromium executable.
Browser rendering uses set_content so network-restricted environments can run it.
HTTP API checks use urllib; the browser receives the real scanner response through
an explicitly injected test transport. This is NOT a full browser-network E2E test.
"""
import asyncio, json, os, subprocess, urllib.request, urllib.error
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('OPEN_VIEW_SCREENSHOTS',str(ROOT.parent)))
async def main():
    server=subprocess.Popen(['node','server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    lines=[server.stdout.readline() for _ in range(3)]
    url=lines[-1].strip(); base=url.split('/#')[0]; token=url.split('token=')[-1]
    checks=[]
    def request(path,headers=None,method='GET'):
      req=urllib.request.Request(base+path,headers=headers or {},method=method)
      try:
        with urllib.request.urlopen(req) as r:return r.status,r.read(),r.headers
      except urllib.error.HTTPError as e:return e.code,e.read(),e.headers
    try:
      assert request('/api/graph')[0]==401;checks.append('HTTP: unauthenticated graph request rejected')
      status,_,headers=request('/api/session',{'Authorization':'Bearer '+token},'POST');assert status==200
      cookie=headers['Set-Cookie'].split(';')[0]
      status,body,_=request('/api/graph',{'Cookie':cookie});assert status==200
      actual_graph=json.loads(body);checks.append('HTTP: authenticated AST graph returned')
      assert request('/api/graph',{'Cookie':cookie,'Origin':'https://attacker.invalid'})[0]==403
      checks.append('HTTP: untrusted Origin rejected')
      assert request('/api/graph',{'Cookie':cookie,'Host':'attacker.invalid:4317'})[0]==403
      checks.append('HTTP: untrusted Host rejected')
      assert request('/.env')[0]==404;checks.append('HTTP: arbitrary file not exposed')
      async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1920,'height':1200},device_scale_factor=1)
        page.set_default_timeout(6000)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        await page.set_content((ROOT/'public/index.html').read_text(),wait_until='domcontentloaded')
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT/'open-view-01-project-map.png'))
        await page.frame_locator('#demoFrame').get_by_role('button',name='고객 저장').click()
        await page.wait_for_timeout(1800)
        assert await page.locator('.trace-row').count()==6
        checks.append('UI: embedded page click produces six SIMULATED trace steps')
        await page.screenshot(path=str(OUT/'open-view-02-trace.png'))
        await page.select_option('#scenario','mock');await page.click('#runBtn');await page.wait_for_timeout(1300)
        assert await page.locator('.trace-row').count()==4
        assert 'sampleCustomers' in await page.locator('#inspectBody').inner_text()
        checks.append('UI: mock fallback explicitly labeled fixture')
        await page.screenshot(path=str(OUT/'open-view-03-mock-fallback.png'))
        await page.click('[data-view="provenance"]');await page.screenshot(path=str(OUT/'open-view-04-provenance.png'))
        await page.click('[data-view="graph"]');await page.select_option('#scenario','error');await page.click('#runBtn');await page.wait_for_timeout(1300)
        assert 'ERROR' in await page.locator('#traceRows').inner_text();checks.append('UI: error scenario reports ERROR')
        await page.evaluate('g => { window.fetch = async path => { if(path === "/api/graph") return new Response(JSON.stringify(g), {status:200}); throw new Error("Unexpected test request"); }; }',actual_graph)
        await page.click('#scanBtn');await page.wait_for_timeout(300)
        assert 'STATIC' in await page.locator('#demoNotice').inner_text()
        assert 'handleSave' in await page.locator('#nodes').inner_text()
        checks.append('UI: actual AST response rendered through injected test transport')
        await page.screenshot(path=str(OUT/'open-view-05-static-scan.png'))
        await page.click('[data-view="provenance"]')
        assert 'Supabase customers' not in await page.locator('#provenanceView').inner_text()
        checks.append('UI: static findings do not mix DEMO resources')
        await page.click('[data-view="graph"]');await page.click('#demoMode');await page.locator('#routeNav [data-route="/orders"]').click()
        assert '/orders' in await page.locator('[data-id="page"]').inner_text();checks.append('UI: route switching')
        await page.fill('#search','Redis');assert await page.locator('.node.dim').count()>0
        await page.keyboard.press('Escape');assert await page.locator('.node.dim').count()==0
        checks.append('UI: search and reset')
        old=await page.locator('#zoomLabel').inner_text();await page.click('#zoomIn');assert old!=await page.locator('#zoomLabel').inner_text()
        checks.append('UI: canvas zoom')
        async with page.expect_download(timeout=5000) as info:await page.click('#exportBtn')
        download=await info.value;assert download.suggested_filename=='open-view-demo.json'
        checks.append('UI: labeled graph JSON export')
        assert not errors,errors;checks.append('UI: no uncaught browser exceptions')
        await browser.close()
    finally:
      server.terminate();server.wait(timeout=5)
    report={'checks':checks,'passed':len(checks),'browser':'Chromium','viewport':'1920x1200','limitations':['UI loaded with set_content. Browser-network E2E not tested because container browser navigation is policy-restricted.','API HTTP transport tested separately with urllib.','Only Linux execution tested; runtime instrumentation is not implemented.']}
    (ROOT/'docs/ui-test-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
asyncio.run(main())
