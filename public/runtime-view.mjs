import { renderSourceGraph } from './source-view.mjs';

/** Single-flight, abortable polling. Manual refreshes coalesce; stopped work cannot restart the loop. */
export function createRefreshLoop({ load, onError = () => true, intervalMs = 1000,
  maxDelayMs = 10000, timeoutMs = 8000, timers = globalThis } = {}) {
  if (typeof load !== 'function' || ![intervalMs, maxDelayMs, timeoutMs].every(n => Number.isFinite(n) && n > 0)
      || maxDelayMs < intervalMs) throw new TypeError('Invalid refresh loop configuration');
  let automatic = false, requested = false, timer = null, work = null, epoch = 0, failures = 0;
  const cancelTimer = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; };
  async function run() {
    if (work || !requested) return;
    cancelTimer(); requested = false;
    const current = epoch, controller = new AbortController(); work = controller;
    let timedOut = false;
    const deadline = timers.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      await load(controller.signal);
      if (timedOut) throw new Error('Refresh timed out');
      if (current === epoch) failures = 0;
    } catch (error) {
      if (current === epoch) {
        failures++;
        const retryMs = Math.min(maxDelayMs, intervalMs * 2 ** Math.min(failures - 1, 16));
        if (onError(error, { timedOut, retryMs }) === false) { automatic = false; requested = false; }
      }
    } finally {
      timers.clearTimeout(deadline); work = null;
      if (requested || automatic) {
        const delay = requested ? 0 : Math.min(maxDelayMs, intervalMs * 2 ** Math.min(Math.max(0, failures - 1), 16));
        timer = timers.setTimeout(() => { timer = null; requested = true; void run(); }, delay);
      }
    }
  }
  return {
    start() { if (!automatic) { automatic = true; this.refresh(); } },
    refresh() { requested = true; cancelTimer(); void run(); },
    stop() { automatic = false; requested = false; epoch++; failures = 0; cancelTimer(); work?.abort(); },
  };
}

/** Keep OBSERVED records separate from DEMO/STATIC. Polling never changes target application behavior. */
export function createRuntimeView({ root, request, ready }) {
  const document = root.ownerDocument, window = document.defaultView;
  const chrome = document.createElement('style');
  chrome.textContent = `
    .source-section{margin:20px 0;padding:16px;border:1px solid #354959;border-radius:8px}
    .source-viewport{overflow:auto;max-height:430px;background:#0d151d;border-radius:8px}
    .source-canvas{position:relative}.source-lines{position:absolute;inset:0;pointer-events:none}
    .source-edge{fill:none;stroke:#77e6bc;stroke-width:2;opacity:.65}
    .source-node{position:absolute;display:flex;flex-direction:column;gap:6px;width:260px;min-height:130px;padding:12px;text-align:left;border:2px solid #77e6bc;border-radius:9px;background:#172d29;cursor:pointer}
    .source-node.selected{outline:2px solid #8fbaff;outline-offset:3px}.source-node span{font-size:10px;overflow-wrap:anywhere}
    .source-node strong{font-size:13px}.source-preview{overflow-wrap:anywhere}.source-preview pre{max-height:400px;overflow:auto}

    body:has(#runtimeView.open) .layout{grid-template-columns:224px minmax(0,1fr)}
    body:has(#runtimeView.open) #inspector,
    body:has(#runtimeView.open) #routeNav,
    body:has(#runtimeView.open) #filetree,
    body:has(#runtimeView.open) .sidebar>hr,
    body:has(#runtimeView.open) .sidebar>.section-label:not(:first-child),
    body:has(#runtimeView.open) .topbar>.project-title,
    body:has(#runtimeView.open) .topbar>.search,
    body:has(#runtimeView.open) #searchResults{display:none!important}
    body:has(#runtimeView.open) #logoutBtn{margin-left:auto}
    @media(max-width:1200px){body:has(#runtimeView.open) .layout{grid-template-columns:190px minmax(0,1fr)}}
    @media(max-width:900px){body:has(#runtimeView.open) .layout{grid-template-columns:175px minmax(0,1fr)}}
  `;
  document.head.append(chrome);
  let mounted = false, active = false, pageHidden = false, auto = true, deleting = false, epoch = 0;
  let selected = null, selectedName = '', detailSignature = '', sourceController = null, deleteController = null;
  let status, syncStatus, list, detail, reload, toggle, remove, lastSuccess = null;
  const buttons = new Map();
  const text = (tag, value, className) => {
    const element = document.createElement(tag); element.textContent = value;
    if (className) element.className = className; return element;
  };
  const visible = () => mounted && root.isConnected && !pageHidden && !document.hidden && root.classList.contains('open');
  const current = (ticket, signal) => ticket === epoch && visible() && !signal.aborted;
  const failure = status => Object.assign(new Error('Runtime request failed'), { status });
  const lastSeen = () => lastSuccess ? `마지막 성공 ${lastSuccess.toLocaleTimeString('ko-KR')}` : '아직 조회 성공 없음';
  function controls() {
    if (!mounted) return;
    toggle.textContent = auto ? '자동 갱신 중지' : '자동 갱신 시작';
    toggle.setAttribute('aria-pressed', String(auto));
    reload.disabled = toggle.disabled = remove.disabled = deleting;
  }
  function clearSelection(message = '목록에서 실행을 선택하세요.') {
    selected = null; selectedName = ''; detailSignature = ''; sourceController?.abort();
    detail.replaceChildren(text('p', message)); delete detail.dataset.selected;
    for (const button of buttons.values()) button.setAttribute('aria-pressed', 'false');
  }
  function reportError(error, { timedOut = false, retryMs = 0 } = {}) {
    if (!visible()) return false;
    if ([401, 403].includes(error.status)) {
      auto = false; controls(); buttons.clear(); list.replaceChildren();
      clearSelection('로그인 후 실행을 다시 선택하세요.');
      status.textContent = '인증이 만료되었거나 접근이 거부되었습니다. 터미널에서 auth로 새 로그인 링크를 여세요.';
      syncStatus.textContent = '자동 갱신 중단 · 인증 필요'; return false;
    }
    if (error.status === 404) {
      auto = false; controls(); buttons.clear(); list.replaceChildren(); clearSelection();
      status.textContent = '현재 서버에는 런타임 수집기가 연결되지 않았습니다. npm run example:runtime으로 예제를 실행하세요.';
      syncStatus.textContent = '자동 갱신 중단 · 수집기 없음'; return false;
    }
    syncStatus.textContent = `${timedOut ? '조회 시간 초과' : '연결 오류'} · ${lastSeen()} · 표시된 기록은 최신이 아닐 수 있습니다.${auto ? ` ${retryMs / 1000}초 후 재시도합니다.` : ' 새로고침으로 다시 시도하세요.'}`;
    return true;
  }
  function renderList(traces) {
    list.querySelector('.runtime-empty')?.remove();
    const retained = new Set(traces.map(trace => trace.traceId));
    for (const [id, button] of buttons) if (!retained.has(id)) { button.remove(); buttons.delete(id); }
    traces.forEach((trace, index) => {
      let button = buttons.get(trace.traceId);
      if (!button) {
        button = text('button', '', 'route-card runtime-trace'); button.type = 'button';
        button.dataset.traceId = trace.traceId; buttons.set(trace.traceId, button);
        button.onclick = () => {
          epoch++; loop.stop(); sourceController?.abort(); selected = trace.traceId;
          selectedName = button.dataset.name; detailSignature = ''; detail.dataset.selected = selected;
          detail.replaceChildren(text('p', '상세 조회 중…'));
          for (const item of buttons.values()) item.setAttribute('aria-pressed', String(item === button));
          if (auto) loop.start(); else loop.refresh();
        };
      }
      button.dataset.name = trace.name;
      const label = `${trace.name}\n${trace.spans} spans · ${trace.errors} errors\n${trace.transactions.join(', ') || '저장 결과 미확인'}`;
      if (button.textContent !== label) button.textContent = label;
      button.setAttribute('aria-pressed', String(trace.traceId === selected));
      if (list.children[index] !== button) list.insertBefore(button, list.children[index] || null);
    });
    if (!traces.length) list.append(text('p', '아직 수신한 실행 기록이 없습니다. 연결한 개발 페이지에서 동작을 실행하세요.', 'runtime-empty'));
  }
  function renderDetail(data) {
    const signature = JSON.stringify(data);
    if (signature === detailSignature) return; // Keep the exact selected code/scroll/focus when unchanged.
    const previous = detail.querySelector('.source-node.selected');
    const selection = previous && { manifest: previous.dataset.manifestId, definition: previous.dataset.definitionId };
    const viewport = detail.querySelector('.source-viewport');
    const scroll = viewport && { top: viewport.scrollTop, left: viewport.scrollLeft };
    const name = data.events.find(event => event.kind === 'action')?.name || selectedName;
    sourceController?.abort(); sourceController = new AbortController();
    const sourceSignal = sourceController.signal;
    detail.replaceChildren(text('h3', name), text('p', `trace ${data.traceId}`, 'mono'));
    detail.append(text('p', `BEST-EFFORT · 누락 부모 ${data.coverage.missingParents.length} · runtime sequence gap ${data.coverage.runtimeSequenceGaps} · Agent 보고 손실 ${data.coverage.reportedDropped}. 소스는 버전별 manifest가 일치할 때만 연결합니다. 기록 없음은 미실행/실패의 증거가 아닙니다.`, 'insight'));
    if (data.sourceGraph) renderSourceGraph({ parent: detail, graph: data.sourceGraph,
      request: (url, init) => request(url, { ...init, signal: sourceSignal }) });
    const table = text('table', '', 'data-table'); table.setAttribute('aria-label', '관측 span');
    const head = document.createElement('thead'), heading = document.createElement('tr');
    for (const label of ['이벤트 / 부모', '시간', '결과 / 저장', '업무 / 출처', '소스 연결']) heading.append(text('th', label));
    head.append(heading); table.append(head);
    const body = document.createElement('tbody');
    const mappings = new Map((data.sourceGraph?.mappings || []).map(item => [item.spanId, item]));
    for (const event of data.events) {
      const row = document.createElement('tr'); row.dataset.spanId = event.spanId;
      row.append(text('td', `${event.name}\n${event.kind}\n${event.spanId} ← ${event.parentSpanId || 'root'}`),
        text('td', `${event.durationMs.toFixed(1)} ms`), text('td', `${event.status} / ${event.outcome.transaction}`),
        text('td', `${event.outcome.business} / ${event.outcome.dataOrigin}`));
      const mapping = mappings.get(event.spanId);
      row.append(text('td', mapping?.status === 'linked' ? `${mapping.sourceRef.moduleId}:${mapping.line} · ${mapping.sourceRef.moduleVersion.slice(0, 8)}` : mapping?.status || 'not-instrumented'));
      body.append(row);
    }
    table.append(body); detail.append(table); detailSignature = signature;
    if (selection) [...detail.querySelectorAll('.source-node')].find(button => button.dataset.manifestId === selection.manifest && button.dataset.definitionId === selection.definition)?.click();
    const nextViewport = detail.querySelector('.source-viewport');
    if (scroll && nextViewport) { nextViewport.scrollTop = scroll.top; nextViewport.scrollLeft = scroll.left; }
  }
  async function load(signal) {
    const ticket = epoch;
    await ready(); if (!current(ticket, signal) || deleting) return;
    const response = await request('/api/traces', { signal });
    if (!current(ticket, signal)) return;
    if (!response.ok) throw failure(response.status);
    const result = await response.json(); if (!current(ticket, signal)) return;
    renderList(result.traces);
    status.textContent = `${result.retainedTraces}개 trace · ${result.retainedEvents}개 span 보관 · 보관 범위 밖 ${result.evicted}개 이벤트 · 최근 ${result.traces.length}개 표시`;
    if (selected) {
      const id = selected;
      const response = await request(`/api/traces/${id}`, { signal });
      if (!current(ticket, signal) || id !== selected) return;
      if (response.status === 404) clearSelection('선택한 실행 기록이 만료되었거나 삭제되었습니다. 다른 실행으로 자동 대체하지 않습니다.');
      else {
        if (!response.ok) throw failure(response.status);
        const data = await response.json(); if (!current(ticket, signal) || id !== selected) return;
        renderDetail(data);
      }
    }
    lastSuccess = new Date();
    syncStatus.textContent = `${auto ? '자동 갱신 · 약 1초 간격' : '자동 갱신 중지 · 수동 조회'} · ${lastSeen()}`;
  }
  const loop = createRefreshLoop({ load, onError: reportError });
  async function removeRecords() {
    if (deleting || !window.confirm('실행 기록과 보관한 원본 소스를 삭제할까요? 삭제 후 현재 로드된 모듈의 소스 연결은 재시작/재컴파일 전까지 미확인으로 표시됩니다.')) return;
    deleting = true; const ticket = ++epoch; loop.stop(); sourceController?.abort(); controls();
    const controller = new AbortController(); deleteController = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      await ready(); if (!current(ticket, controller.signal)) return;
      const response = await request('/api/traces', { method: 'DELETE', signal: controller.signal });
      if (!current(ticket, controller.signal)) return;
      if (!response.ok) throw failure(response.status);
      buttons.clear(); list.replaceChildren(); clearSelection('보관 기록과 원본 소스를 삭제했습니다. 새 실행을 선택하세요.');
      status.textContent = '보관 기록 삭제 완료';
    } catch (error) {
      if (ticket === epoch && visible()) {
        auto = false; reportError(error);
        if (![401, 403, 404].includes(error.status)) syncStatus.textContent = '삭제 응답을 확인하지 못했습니다. 자동 재삭제하지 않습니다. 새로고침으로 보관 상태를 확인하세요.';
      }
    } finally {
      window.clearTimeout(timeout); if (deleteController === controller) deleteController = null;
      deleting = false; controls();
      if (ticket === epoch && visible() && auto) loop.start();
    }
  }
  function mount() {
    mounted = true; lastSuccess = null; buttons.clear(); selected = null; detailSignature = '';
    root.replaceChildren(text('h2', '실제 실행 · OBSERVED'), text('p', '명시적으로 연결한 개발용 Agent의 실제 관측 기록입니다. 약 1초 간격으로 조회하며 시연 데이터와 섞지 않습니다. 자동 갱신 중지는 화면 조회만 멈춥니다.'));
    const bar = text('div', '', 'runtime-controls');
    reload = text('button', '새로고침', 'btn'); toggle = text('button', '', 'btn'); remove = text('button', '보관 기록 삭제', 'btn');
    for (const button of [reload, toggle, remove]) button.type = 'button';
    reload.onclick = () => { if (visible()) loop.refresh(); };
    toggle.onclick = () => {
      auto = !auto; controls();
      if (auto && visible()) loop.start();
      else { loop.stop(); syncStatus.textContent = `자동 갱신 중지 · ${lastSeen()} · 수집은 계속됩니다.`; }
    };
    remove.onclick = removeRecords; bar.append(reload, toggle, remove);
    status = text('p', '실행 기록을 조회하고 있습니다.'); status.setAttribute('role', 'status');
    syncStatus = text('p', '', 'runtime-sync'); syncStatus.setAttribute('aria-live', 'off');
    const layout = text('div', '', 'runtime-layout'); list = text('div', '', 'runtime-list'); detail = text('section', '', 'runtime-detail');
    detail.setAttribute('aria-label', '실행 상세'); clearSelection(); layout.append(list, detail);
    root.append(bar, syncStatus, status, layout); controls();
  }
  function syncActivity() {
    const next = visible(); if (next === active) return;
    active = next; epoch++;
    if (!active) {
      loop.stop(); sourceController?.abort(); deleteController?.abort(); detailSignature = '';
      if (mounted) syncStatus.textContent = `화면 조회 일시 중지 · ${lastSeen()}`;
    } else if (!deleting) { if (auto) loop.start(); else loop.refresh(); }
  }
  const observer = new window.MutationObserver(syncActivity);
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', syncActivity);
  const hide = () => { pageHidden = true; syncActivity(); }, show = () => { pageHidden = false; syncActivity(); };
  window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
  function clear() {
    epoch++; loop.stop(); sourceController?.abort(); deleteController?.abort(); mounted = false; active = false;
    selected = null; detailSignature = ''; buttons.clear(); root.replaceChildren();
  }
  function refresh() {
    if (!mounted) mount();
    // showView calls this before adding .open. Observe its final state, not the intermediate class list.
    queueMicrotask(() => { const wasActive = active; syncActivity(); if (wasActive && visible() && !deleting) loop.refresh(); });
  }
  return { refresh, clear, destroy() {
    clear(); observer.disconnect(); chrome.remove(); document.removeEventListener('visibilitychange', syncActivity);
    window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
  } };
}
