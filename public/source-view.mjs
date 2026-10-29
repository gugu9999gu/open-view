const text = (tag, value, className) => {
  const element = document.createElement(tag); element.textContent = value;
  if (className) element.className = className; return element;
};
const svgElement = (tag, attributes) => { const element = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key,value] of Object.entries(attributes)) element.setAttribute(key,String(value)); return element; };
/** Version-pinned graph for one observed trace. Never reuse the current static/demo graph. */
export function renderSourceGraph({ parent, graph, request }) {
  const section = text('section','','source-section'); section.setAttribute('aria-label','실행 소스 그래프');
  section.append(text('h3','실행 소스 그래프 · 버전 고정'), text('p',`${graph.linkedSpans}개 span 소스 연결 · ${graph.unlinkedSpans}개 미연결 · 부모 탐색 상한 ${graph.ancestryTruncated || 0}개. 강조된 노드는 Agent가 보고한 실행입니다. 선은 관측된 부모 관계이며 직접 호출을 확정하지 않습니다.`));
  const viewport = text('div','','source-viewport'), canvas = text('div','','source-canvas');
  const nodes = graph.nodes.slice(0,100), columns = 3, width = 880, height = Math.max(1,Math.ceil(nodes.length/columns))*180;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const positions = new Map(nodes.map((node,index)=>[node.id,{x:10+(index%columns)*290,y:20+Math.floor(index/columns)*180}]));
  const lines = svgElement('svg',{width,height,class:'source-lines','aria-label':'관측 부모 연결선'});
  for (const edge of graph.edges) {
    const a = positions.get(edge.source), b = positions.get(edge.target); if (!a || !b) continue;
    const path = svgElement('path',{d: `M ${a.x+130} ${a.y+130} C ${a.x+130} ${a.y+160}, ${b.x+130} ${b.y-20}, ${b.x+130} ${b.y}`,class:'source-edge'});
    const title = svgElement('title',{}); title.textContent = `관측 부모 관계 · 중간 ${edge.intermediateSpans}개 span · ${edge.executions}회`;
    path.append(title); lines.append(path);
  }
  canvas.append(lines);
  const preview = text('section','','source-preview'); preview.setAttribute('aria-label','실행 당시 소스');
  preview.append(text('p','노드를 선택하면 실행 당시 보관한 원본 함수와 줄 번호를 확인합니다. 현재 디스크 파일을 다시 읽지 않습니다.'));
  let selection = 0;
  async function select(node, button) {
    const current = ++selection;
    canvas.querySelectorAll('.source-node').forEach(element=>element.classList.toggle('selected',element===button));
    preview.replaceChildren(text('p','보관한 소스를 조회하고 있습니다.'));
    try {
      const response = await request(`/api/sources/${node.manifestId}/${node.id}`);
      if (current !== selection || !section.isConnected) return;
      if (!response.ok) throw new Error('소스가 만료되었거나 접근할 수 없습니다. 최신 파일로 대신 연결하지 않습니다.');
      const source = await response.json(); if (current !== selection || !section.isConnected) return;
      preview.replaceChildren(text('h4',`${source.sourceRef.moduleId}:${source.line}`),text('p',`SHA-256 ${source.sourceRef.moduleVersion}`,'mono'));
      const code = text('pre',source.code.split('\n').map((line,index)=>`${source.line+index}  ${line}`).join('\n'),'codeblock source-code');
      preview.append(text('p','선택적으로 보관한 로컬 원본 코드입니다. 코드에 적힌 상수도 포함되므로 화면·내보내기 공유 시 주의하세요.'),code);
    } catch(error) { if (current === selection && section.isConnected) preview.replaceChildren(text('p',error.message)); }
  }
  for (const node of nodes) {
    const position = positions.get(node.id), button = text('button','','source-node observed'); button.type = 'button';
    button.dataset.definitionId = node.id; button.dataset.manifestId = node.manifestId;
    button.style.left = `${position.x}px`; button.style.top = `${position.y}px`;
    button.append(text('span',`OBSERVED · ${node.executions}회 · ${node.errors} errors`,'pill green'),text('strong',node.label),
      text('span',`${node.sourceRef.moduleId}:${node.line}`,'mono'),text('span',`version ${node.sourceRef.moduleVersion.slice(0,12)}`,'mono'));
    button.onclick = ()=>select(node,button); canvas.append(button);
  }
  if (!nodes.length) section.append(text('p','연결 가능한 소스 참조가 없습니다. 함수명이나 시간으로 추정 연결하지 않습니다.'));
  if (graph.nodes.length > nodes.length) section.append(text('p',`전체 ${graph.nodes.length}개 중 ${nodes.length}개 노드 표시. 전체 span과 연결 판정은 아래 표에 보존됩니다.`));
  viewport.append(canvas); section.append(viewport,preview); parent.append(section);
}
