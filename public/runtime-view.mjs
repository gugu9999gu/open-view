/** Keep OBSERVED records separate from the demo/static graph; never infer source links by name. */
export function createRuntimeView({ root, request, ready }) {
  // Unrelated DEMO/STATIC side panels must not appear to explain an observed trace.
  const chrome = document.createElement('style');
  chrome.textContent = `
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
  let epoch = 0;
  const text = (tag, value, className) => { const element = document.createElement(tag); element.textContent = value; if (className) element.className = className; return element; };
  function clear() { epoch++; root.replaceChildren(); }
  async function refresh() {
    const current = ++epoch;
    root.replaceChildren(text('h2', '실제 실행 · OBSERVED'), text('p', '명시적으로 연결한 개발용 Agent의 실제 관측 기록입니다. 시연 데이터와 섞지 않습니다.'));
    const controls = text('div', '', 'runtime-controls'), reload = text('button', '새로고침', 'btn'), remove = text('button','보관 기록 삭제','btn');
    reload.type = remove.type = 'button'; reload.onclick = refresh;
    remove.onclick = async () => {
      if (!confirm('보관 중인 실행 기록을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
      try { await ready(); const response = await request('/api/traces', { method:'DELETE' }); if (!response.ok) throw new Error(); await refresh(); }
      catch { root.append(text('p','삭제하지 못했습니다. 로그인 상태를 확인하세요.')); }
    };
    controls.append(reload,remove); root.append(controls);
    const status = text('p','실행 기록을 조회하고 있습니다.'); status.setAttribute('role','status'); root.append(status);
    try {
      await ready(); const response = await request('/api/traces');
      if (current !== epoch) return;
      if (response.status === 404) { status.textContent = '현재 서버에는 런타임 수집기가 연결되지 않았습니다. npm run example:runtime으로 예제를 실행하세요.'; return; }
      if (!response.ok) throw new Error('조회 실패: 로그인 또는 수집기 상태를 확인하세요.');
      const result = await response.json(); if (current !== epoch) return;
      status.textContent = `${result.retainedTraces}개 trace · ${result.retainedEvents}개 span 보관 · 보관 범위 밖 ${result.evicted}개 이벤트 · 최근 ${result.traces.length}개 표시`;
      const layout = text('div','','runtime-layout'), list = text('div','','runtime-list'), detail = text('section','','runtime-detail');
      detail.setAttribute('aria-label','실행 상세');
      layout.append(list,detail); root.append(layout);
      for (const trace of result.traces) {
        const button = text('button',`${trace.name}\n${trace.spans} spans · ${trace.errors} errors\n${trace.transactions.join(', ') || '저장 결과 미확인'}`, 'route-card runtime-trace');
        button.type = 'button'; button.dataset.traceId = trace.traceId;
        button.onclick = async () => {
          const selected = trace.traceId; detail.dataset.selected = selected; detail.replaceChildren(text('p','상세 조회 중…'));
          try {
            const response = await request(`/api/traces/${selected}`); if (!response.ok) throw new Error();
            const data = await response.json(); if (current !== epoch || detail.dataset.selected !== selected) return;
            detail.replaceChildren(text('h3',trace.name),text('p',`trace ${data.traceId}`,'mono'));
            const warning = text('p',`BEST-EFFORT · 누락 부모 ${data.coverage.missingParents.length} · runtime sequence gap ${data.coverage.runtimeSequenceGaps} · Agent 보고 손실 ${data.coverage.reportedDropped}. 소스 연결 미구현. 기록 없음은 미실행/실패의 증거가 아닙니다.`, 'insight');
            detail.append(warning);
            const table = text('table','','data-table'); table.setAttribute('aria-label','관측 span');
            const head = document.createElement('thead'), row = document.createElement('tr');
            for (const label of ['이벤트 / 부모','시간','결과 / 저장','업무 / 출처']) row.append(text('th',label)); head.append(row); table.append(head);
            const body = document.createElement('tbody');
            for (const event of data.events) {
              const row = document.createElement('tr'); row.dataset.spanId = event.spanId;
              row.append(text('td',`${event.name}\n${event.kind}\n${event.spanId} ← ${event.parentSpanId || 'root'}`),text('td',`${event.durationMs.toFixed(1)} ms`),text('td',`${event.status} / ${event.outcome.transaction}`),text('td',`${event.outcome.business} / ${event.outcome.dataOrigin}`)); body.append(row);
            }
            table.append(body); detail.append(table);
          } catch { detail.replaceChildren(text('p','기록이 만료되었거나 수집기에 연결할 수 없습니다.')); }
        };
        list.append(button);
      }
      if (!result.traces.length) list.append(text('p','아직 수신한 실행 기록이 없습니다. 예제 페이지에서 저장을 실행하세요.'));
    } catch (error) { if (current === epoch) status.textContent = error.message; }
  }
  return { refresh, clear };
}
