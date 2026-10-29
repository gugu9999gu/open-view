"""Real browser -> HTTP server E2E. Never replaces fetch or uses set_content.
Install scripts/requirements-test.txt and Playwright Chromium first.
A blocked browser/navigation is a failed run, never a silent pass or mock fallback.
"""
import asyncio
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('OPEN_VIEW_TEST_OUTPUT', str(ROOT / 'artifacts' / 'e2e')))


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    checks, browser_errors, csp_errors = [], [], []
    server = browser = target = None
    report = {'scope': 'real-browser-network-e2e', 'generatedAt': datetime.now(timezone.utc).isoformat(),
              'commit': os.environ.get('GITHUB_SHA'), 'checks': checks, 'passed': 0, 'status': 'failed'}
    with tempfile.TemporaryDirectory(prefix='open-view-e2e-') as temp:
        project = Path(temp) / 'project'
        shutil.copytree(ROOT / 'examples' / 'demo-project', project)
        (project / 'zz-many.ts').write_text('\n'.join(
            f'export function sentinelFunction{i}() {{ return {i}; }}' for i in range(160)))
        deep = project.joinpath(*(['nested'] * 21))
        deep.mkdir(parents=True)
        (deep / 'hidden.ts').write_text('export function hiddenByDepth() {}')
        try:
            server = await asyncio.create_subprocess_exec(
                'node', 'server.mjs', '--project', str(project), '--port', '0', cwd=ROOT,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            lines = [await asyncio.wait_for(server.stdout.readline(), timeout=15) for _ in range(3)]
            login_url = lines[-1].decode().strip()
            if '/#token=' not in login_url:
                raise RuntimeError('Server did not produce a login URL')
            base, bootstrap = login_url.split('/#token=', 1)
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(
                    executable_path=os.environ.get('CHROMIUM_PATH'), headless=True)
                context = await browser.new_context(viewport={'width': 1920, 'height': 1200})
                page = await context.new_page()
                page.set_default_timeout(10000)
                page.on('pageerror', lambda error: browser_errors.append(str(error)))
                page.on('console', lambda message: csp_errors.append(message.text)
                        if message.type == 'error' and ('Content Security Policy' in message.text or 'violates the following' in message.text) else None)
                async with page.expect_response(lambda r: r.url == base + '/api/session' and r.request.method == 'POST') as login:
                    await page.goto(login_url, wait_until='networkidle')
                login_response = await login.value
                assert login_response.status == 200
                session = await login_response.json()
                assert session['accessToken'] != bootstrap
                assert await page.evaluate('location.hash') == ''
                assert not any(cookie['name'] == 'ov_session' for cookie in await context.cookies())
                checks.append('real navigation exchanges a one-time token without an auth cookie')
                replay = await context.request.post(base + '/api/session', headers={'Authorization': 'Bearer ' + bootstrap})
                assert replay.status == 401
                checks.append('bootstrap replay denied over HTTP')

                await page.frame_locator('#demoFrame').get_by_role('button', name='고객 저장').click()
                await expect(page.locator('.trace-row')).to_have_count(6)
                await expect(page.locator('#runBtn')).to_be_enabled()
                assert 'SIMULATION' in await page.locator('#traceBadge').inner_text()
                await page.screenshot(path=str(OUT / 'demo.png'))
                checks.append('nonce-protected iframe button produces explicitly simulated trace')
                for scenario, expected in [('mock', 'FIXTURE'), ('error', 'ERROR')]:
                    await page.select_option('#scenario', scenario)
                    await page.click('#runBtn')
                    await expect(page.locator('.trace-row')).to_have_count(4)
                    await expect(page.locator('#runBtn')).to_be_enabled()
                    assert expected in await page.locator('#traceRows').inner_text()
                    checks.append(f'demo {scenario} outcome remains explicit')

                async with page.expect_response(base + '/api/graph') as result:
                    await page.click('#scanBtn')
                response = await result.value
                assert response.status == 200
                graph = await response.json()
                await expect(page.locator('#demoNotice')).to_contain_text('STATIC')
                assert len(graph['nodes']) > 100
                assert await page.locator('.node').count() == 100
                await expect(page.locator('#coverageSummary')).to_contain_text('부분 분석')
                assert 'depth-limit' in await page.locator('#coverageSummary').inner_text()
                checks.append('real worker AST response renders a bounded canvas with partial-coverage notice')
                assert await page.locator('.node-title').filter(has_text='sentinelFunction159').count() == 0
                await page.fill('#search', 'sentinelFunction159')
                await page.locator('[data-search-node]').filter(has_text='sentinelFunction159').click()
                await expect(page.locator('.node.selected .node-title')).to_have_text('sentinelFunction159')
                assert await page.locator('.node').count() <= 100
                assert 'zz-many.ts' in await page.locator('#nodes').inner_text()
                checks.append('search reaches node beyond first 100 and focuses its source neighborhood')
                await page.fill('#search', 'sentinelFunction')
                for _ in range(5):
                    await page.click('#searchNext')
                assert '전체 160개 결과' in await page.locator('#searchResults').inner_text()
                assert 'sentinelFunction159' in await page.locator('#searchResults').inner_text()
                checks.append('search pagination reaches all matching source definitions')
                await page.keyboard.press('Escape')
                await page.screenshot(path=str(OUT / 'static-search.png'))
                await page.click('[data-view="provenance"]')
                assert 'Supabase customers' not in await page.locator('#provenanceView').inner_text()
                checks.append('static provenance is not mixed with demo resources')
                await page.click('[data-view="graph"]')
                async with page.expect_download() as exported:
                    await page.click('#exportBtn')
                download = await exported.value
                payload = json.loads(Path(await download.path()).read_text())
                assert payload['mode'] == 'static' and payload['root'] == '<project-root>'
                assert len(payload['nodes']) == len(graph['nodes'])
                assert session['accessToken'] not in json.dumps(payload)
                checks.append('export contains whole graph and no auth token or absolute project root')
                await page.reload(wait_until='networkidle')
                async with page.expect_response(base + '/api/graph') as reloaded:
                    await page.click('#scanBtn')
                assert (await reloaded.value).status == 200
                checks.append('reload uses sessionStorage without reusing bootstrap link')

                seen = []
                class TargetHandler(BaseHTTPRequestHandler):
                    def do_GET(self):
                        seen.append({'authorization': bool(self.headers.get('Authorization')),
                                     'authCookie': 'ov_session=' in self.headers.get('Cookie', '')})
                        self.send_response(200)
                        self.send_header('Content-Type', 'text/html; charset=utf-8')
                        self.end_headers()
                        self.wfile.write(b'<!doctype html><title>Target application</title>')
                    def log_message(self, *_args):
                        pass
                target = ThreadingHTTPServer(('127.0.0.1', 0), TargetHandler)
                Thread(target=target.serve_forever, daemon=True).start()
                target_page = await context.new_page()
                await target_page.goto(f'http://127.0.0.1:{target.server_port}/', wait_until='networkidle')
                assert await target_page.evaluate('sessionStorage.getItem("open-view.ui-session.v1")') is None
                assert seen and not any(item['authorization'] or item['authCookie'] for item in seen)
                checks.append('different-port application receives neither UI authorization nor UI session storage')
                await target_page.close()
                async with page.expect_response(lambda r: r.url == base + '/api/session' and r.request.method == 'DELETE') as logout:
                    await page.click('#logoutBtn')
                assert (await logout.value).status == 204
                denied = await context.request.get(base + '/api/config', headers={'Authorization': 'Bearer ' + session['accessToken']})
                assert denied.status == 401
                checks.append('logout revokes server session')
                assert not browser_errors, browser_errors
                assert not csp_errors, csp_errors
                checks.append('no uncaught JavaScript exceptions or CSP violations')
                report['status'] = 'passed'
        except Exception as error:
            # Playwright errors can include the navigated capability URL. Do not retain it.
            message = re.sub(r'[a-f0-9]{64}', '[REDACTED]', str(error))
            report['error'] = type(error).__name__ + ': ' + message
        finally:
            if target:
                target.shutdown()
                target.server_close()
            if browser:
                await browser.close()
            if server and server.returncode is None:
                server.terminate()
                try:
                    await asyncio.wait_for(server.wait(), timeout=5)
                except asyncio.TimeoutError:
                    server.kill()
                    await server.wait()
            report['passed'] = len(checks)
            (OUT / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
