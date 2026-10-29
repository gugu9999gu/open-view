import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { traceAction } from '@open-view/runtime';
import './style.css';
function App() {
  const [scenario, setScenario] = useState('success'), [name, setName] = useState('Example customer'), [results, setResults] = useState([]);
  async function save() {
    const input = { scenario, name };
    try {
      const result = await traceAction('Save customer', action => action.span('handleSaveCustomer', async handler => {
        const response = await handler.fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Save failed');
        return result;
      }));
      setResults(previous => [...previous, { scenario: input.scenario, ok: true, origin: result.origin }]);
    } catch { setResults(previous => [...previous, { scenario: input.scenario, ok: false, origin: 'unknown' }]); }
  }
  async function poll() { await fetch('/api/ping'); setResults(previous => [...previous, { scenario: 'poll', ok: true, origin: 'remote' }]); }
  return <main><p className="eyebrow">LOCAL DEVELOPMENT EXAMPLE</p><h1>실제 저장 경로</h1><p>선택한 로컬 PostgreSQL에 예제 레코드를 저장합니다. Open View에서 OBSERVED 실행을 확인하세요.</p>
    <label>예제 이름<input aria-label="예제 이름" value={name} maxLength={80} onChange={event => setName(event.target.value)} /></label>
    <label>실행 시나리오<select aria-label="실행 시나리오" value={scenario} onChange={event => setScenario(event.target.value)}>
      <option value="success">정상 커밋</option><option value="rollback">INSERT 후 롤백</option><option value="after-commit">커밋 후 후속 오류</option><option value="fixture">롤백 후 fixture 반환</option>
    </select></label><div className="actions"><button onClick={save}>저장</button><button onClick={poll}>독립 polling 요청</button></div>
    <p className="note">이름·본문·SQL·오류 원문은 telemetry에 수집하지 않습니다. 수집기를 중단해도 저장 기능은 유지됩니다.</p>
    <ul aria-label="실행 결과">{results.map((result, index) => <li key={index} data-scenario={result.scenario} data-ok={String(result.ok)}>{result.scenario} · {result.ok ? '응답 성공' : '응답 실패'} · 출처 {result.origin}</li>)}</ul>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
