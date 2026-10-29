import {createRuntimeView} from './runtime-view.mjs';
import {createSessionClient} from './session-client.mjs';
import {createGraphIndex, searchGraph, graphWindow} from './graph-model.mjs';
let storage;
try { storage = window.sessionStorage; } catch {}
const sessionClient = createSessionClient({baseUrl: location.href, storage});
const runtimeView = createRuntimeView({root: document.getElementById('runtimeView'), request: (...args)=>sessionClient.request(...args), ready: ()=>authReady});
let staticIndex = null, searchOffset = 0, scanEpoch = 0;
const scriptNonce = document.querySelector('script[src$="app.mjs"]')?.nonce || '';

const paths={network:'M3 4h6v6H3z M15 14h6v6h-6z M3 14h6v6H3z M9 7h7v7 M6 10v4 M9 17h6',folder:'M3 6h6l2 2h10v12H3z',file:'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6',code:'m8 6-5 6 5 6 m8-12 5 6-5 6 M14 3l-4 18',browser:'M3 4h18v16H3z M3 9h18 M6 6h1 M10 6h1',db:'M4 6c0-5 16-5 16 0s-16 5-16 0 M4 6v12c0 5 16 5 16 0V6 M4 12c0 5 16 5 16 0',cloud:'M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5 5 0 0 1 0 11z',layers:'m12 3 10 6-10 6L2 9z M3 13l9 5 9-5 M3 17l9 5 9-5',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',play:'m7 4 14 8-14 8z',download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',shield:'m12 3 8 3v6c0 5-8 10-8 10S4 17 4 12V6z m-4 9 3 3 5-6',pulse:'M2 12h4l3-8 5 16 3-8h5',pointer:'m5 3 14 10-7 1-3 7z',arrow:'M3 12h18 m-6-6 6 6-6 6',check:'m4 12 5 5L20 6'};
const icon=k=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[k]||paths.code}"/></svg>`;
const $=id=>document.getElementById(id);const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}icons();
const routeData=[{url:'/customers',title:'고객 관리',file:'src/app/customers/page.tsx',type:'static'},{url:'/orders',title:'주문 관리',file:'src/app/orders/page.tsx',type:'static'},{url:'/products/[id]',title:'상품 상세',file:'src/app/products/[id]/page.tsx',type:'dynamic'},{url:'/settings',title:'설정',file:'src/app/settings/page.tsx',type:'static'}];
let route='/customers',mode='demo',selected='handler',tab='details',runEpoch=0,running=false,graph=null,trace=[],zoom=1,pan={x:0,y:0},nodes=[],edges=[],frameNonce='',staticGraph=null;
const demoNodes=()=>[
{id:'root',kind:'project',type:'PROJECT ROOT',label:'C:/workspace/example-crm',path:'예시 경로 · 사용자의 실제 폴더가 아닙니다',x:32,y:48,w:330,h:79,icon:'folder',footer:null},
{id:'page',kind:'page',type:'INTERACTIVE PAGE',label:route,path:routeData.find(r=>r.url===route).file,x:32,y:164,w:330,h:401,icon:'browser',footer:'노드 내부 조작 가능 · 시연 전용'},
{id:'handler',kind:'function',type:'CLIENT FUNCTION',label:route==='/customers'?'handleSaveCustomer()':'handleAction()',path:routeData.find(r=>r.url===route).file+':42',x:438,y:164,w:229,h:119,icon:'code',footer:'JSX onClick → handler'},
{id:'api',kind:'api',type:'HTTP REQUEST',label:route==='/customers'?'POST /api/customers':'POST /api/action',path:'Content-Type: application/json',x:745,y:164,w:229,h:119,icon:'arrow',footer:'request → response'},
{id:'service',kind:'function',type:'SERVER FUNCTION',label:'createCustomer()',path:'src/services/customer.service.ts:28',x:745,y:355,w:229,h:119,icon:'code',footer:'서버 계측 필요 · 시연'},
{id:'supabase',kind:'resource',type:'DATABASE / API',label:'Supabase · customers',path:'PostgREST / PostgreSQL',x:1060,y:164,w:238,h:119,icon:'db',footer:'REMOTE · 내용 진위 미확인'},
{id:'redis',kind:'resource',type:'CACHE',label:'Redis · customer:*',path:'DEL / cache invalidation',x:1060,y:355,w:238,h:119,icon:'layers',footer:'원본 출처 추적 필요'},
{id:'firestore',kind:'resource',type:'DATABASE',label:'Firestore · analytics',path:'firebase/firestore',x:1060,y:547,w:238,h:119,icon:'db',footer:'의존성만 존재 · 미관측'},
{id:'fixture',kind:'fixture',type:'FALLBACK / FIXTURE',label:'sampleCustomers[]',path:'src/mocks/customers.ts:4',x:438,y:406,w:229,h:119,icon:'file',footer:'더미 후보 · 예시 분기'},
{id:'host',kind:'host',type:'HOSTING',label:'개발 서버 · :3000',path:'배포 대상 / 환경 분리',x:745,y:547,w:229,h:119,icon:'cloud',footer:'설정상 연결 · 런타임 미확인'},
{id:'route-orders',kind:'route',type:'PAGE',label:'/orders',path:'상세 페이지 목록에서 열기',x:32,y:595,w:158,h:91,icon:'browser',footer:null},
{id:'route-settings',kind:'route',type:'PAGE',label:'/settings',path:'클릭하여 전환',x:204,y:595,w:158,h:91,icon:'browser',footer:null}
];
const demoEdges=()=>[
{id:'e0',source:'root',target:'page',label:'contains',kind:'static',vertical:true},
{id:'e1',source:'page',target:'handler',label:'onClick',kind:'static'},
{id:'e2',source:'handler',target:'api',label:'fetch()',kind:'static'},
{id:'e3',source:'api',target:'service',label:'handler',kind:'static',vertical:true},
{id:'e4',source:'service',target:'supabase',label:'insert',kind:'static'},
{id:'e5',source:'service',target:'redis',label:'invalidate',kind:'static'},
{id:'e6',source:'handler',target:'fixture',label:'fallback',kind:'mock',vertical:true},
{id:'e7',source:'host',target:'service',label:'runs-on',kind:'static',vertical:true},
{id:'e8',source:'root',target:'route-orders',label:'route',kind:'static'},
{id:'e9',source:'root',target:'route-settings',label:'route',kind:'static'},
{id:'e10',source:'host',target:'firestore',label:'SDK import only',kind:'static'}
];
const demoFileTree=$('filetree').innerHTML, demoProvenance=$('provenanceView').innerHTML;
function renderRouteNav(){
if(mode==='static'&&staticGraph){const rs=staticGraph.nodes.filter(n=>n.kind==='route');$('routeNav').innerHTML=rs.map(n=>`<button class="navbutton mono" data-static-route="${esc(n.id)}">${esc(n.label)}</button>`).join('');$('routeCards').innerHTML=rs.map(n=>`<article class="route-card"><h3>${esc(n.label)}</h3><span class="pill blue">STATIC · 미방문</span><p>${esc(n.path)}<br>실제 웹페이지 연결은 아직 구현되지 않았습니다.</p><button class="btn" data-static-route="${esc(n.id)}">소스 노드 확인</button></article>`).join('');return;}

$('routeNav').innerHTML=routeData.map(r=>`<button class="navbutton ${route===r.url?'active':''}" data-route="${esc(r.url)}"><span class="mono" style="font-size:11px">${esc(r.url)}</span>${r.type==='dynamic'?'<span class="count">[ ]</span>':''}</button>`).join('');
$('routeCards').innerHTML=routeData.map(r=>`<article class="route-card"><h3>${esc(r.url)}</h3><span class="pill ${r.type==='dynamic'?'amber':'blue'}">${r.type==='dynamic'?'동적 패턴 · id 필요':'정적 URL'}</span><p>${esc(r.title)}<br><span class="mono small">${esc(r.file)}</span></p><button class="btn" data-route="${esc(r.url)}">${r.type==='dynamic'?'예시 ID로 보기':'노드에서 열기'} ${icon('arrow')}</button></article>`).join('');
}
function frameHTML(){
frameNonce=crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
const target=location.origin==='null'?'*':location.origin;
const title=routeData.find(r=>r.url===route).title;const isCustomer=route==='/customers';
return `<!doctype html><html lang="ko"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7f8;color:#273340;font:12px/1.5 "Noto Sans CJK KR","Malgun Gothic",sans-serif}.nav{background:#fff;border-bottom:1px solid #dce4e8;display:flex;align-items:center;justify-content:space-between;padding:13px 15px}.nav b{font-size:11px;letter-spacing:1px}.nav span{font-size:9px;color:#81909a}.body{padding:15px}h2{font-size:18px;letter-spacing:-.5px;margin:0 0 2px}p{font-size:10px;color:#83909b;margin:0 0 11px}.item{background:white;border:1px solid #dce4e8;border-radius:6px;padding:9px;display:flex;align-items:center;gap:9px}.avatar{height:25px;width:25px;background:#e2f0e9;border-radius:50%;display:grid;place-items:center;font-size:10px;color:#357e61}.item small{display:block;color:#8c9ba4;font-size:9px}.form{display:flex;gap:6px;margin-top:12px}input{width:100%;min-width:0;border:1px solid #cfdbe1;border-radius:5px;padding:9px;font:10px inherit}button{white-space:nowrap;border:0;background:#1c7258;color:white;border-radius:5px;padding:8px 11px;font-size:10px;cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #2f8cde;outline-offset:2px}.state{color:#4d846a;font-size:9px;margin-top:8px}</style><div class="nav"><b>EXAMPLE CRM</b><span>DEVELOPMENT / DEMO</span></div><div class="body"><h2>${esc(title)}</h2><p>UI 시연 · 실제 저장되지 않습니다</p><div class="item"><div class="avatar">EX</div><div>${isCustomer?'테스트 고객 A':route==='/orders'?'테스트 주문 #001':route==='/settings'?'테스트 워크스페이스':'예시 상품 · id=demo-001'}<small>${isCustomer?'demo@example.invalid':'모든 값은 예시 데이터입니다'}</small></div></div><form class="form" id="form"><input aria-label="시연 입력" placeholder="${isCustomer?'고객 이름 입력':'예시 값 입력'}" value="${isCustomer?'테스트 고객 B':'테스트 값'}"><button type="button" id="save">${isCustomer?'고객 저장':'저장'}</button></form><div class="state" id="state">버튼을 눌러 연결 흐름을 확인하세요.</div></div><script nonce="${esc(scriptNonce)}">document.getElementById('save').addEventListener('click',function(e){e.preventDefault();document.getElementById('state').textContent='시뮬레이션이 실행되었습니다. 실제 저장 없음.';parent.postMessage({type:'open-view:demo',nonce:${JSON.stringify(frameNonce)}},${JSON.stringify(target)});});<\/script></html>`;
}
function drawGraph(reset=true){
if(mode==='demo'){nodes=demoNodes();edges=demoEdges();}
$('nodes').innerHTML=(mode==='demo'?'<div class="lane" style="left:32px">01 / PROJECT & PAGE</div><div class="lane" style="left:438px">02 / SOURCE & FUNCTIONS</div><div class="lane" style="left:745px">03 / REQUEST & SERVER</div><div class="lane" style="left:1060px">04 / RESOURCES</div>':'')+nodes.map(n=>`<article tabindex="0" role="button" aria-label="${esc(n.label)} 상세" class="node ${n.kind} ${n.kind==='fixture'?'mock-node':''} ${selected===n.id?'selected':''}" data-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;min-height:${n.h}px"><div class="node-head"><span class="node-icon">${icon(n.icon||'code')}</span><span class="kind">${esc(n.type||n.kind.toUpperCase())}</span>${n.kind==='fixture'?'<span class="pill amber badge">MOCK</span>':n.kind==='page'?'<span class="pill green badge">PLAY</span>':''}</div><div class="node-title mono">${esc(n.label)}</div><div class="node-file mono" title="${esc(n.path)}">${esc(n.path||'')}</div>${n.kind==='page'?'<div class="browserbar"><span class="browser-dot"></span><span class="browser-dot"></span><span class="browser-url mono">localhost:3000'+esc(route)+'</span></div><iframe id="demoFrame" title="조작 가능한 예시 웹페이지" sandbox="allow-scripts"></iframe>':''}${n.footer?`<div class="node-foot"><span>${esc(n.footer)}</span><span>${mode==='demo'?'예시':'STATIC'}</span></div>`:''}</article>`).join('');
if(mode==='demo')$('demoFrame').srcdoc=frameHTML();
$('graphStats').textContent=mode==='static'?`전체 ${staticGraph.nodes.length} · 표시 ${nodes.length} nodes / ${edges.length} connections`:`${nodes.length} nodes · ${edges.length} connections`;
$('coveragePanel').hidden=mode!=='static';
$('demoNotice').textContent=mode==='demo'?'DEMO · 경로와 실행 시간은 예시입니다':'STATIC · 실제 코드 분석 / 실행 여부는 미확인';
$('demoMode').classList.toggle('active',mode==='demo');$('staticMode').classList.toggle('active',mode==='static');$('runBtn').disabled=mode!=='demo';$('scenario').disabled=mode!=='demo';
paintEdges();if(reset)fit();inspect(selected);renderRouteNav();
}
function paintEdges(){
$('edges').innerHTML='<defs><marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#60788e"/></marker></defs>'+edges.map(e=>{const a=nodes.find(n=>n.id===e.source),b=nodes.find(n=>n.id===e.target);if(!a||!b)return'';let d,lx,ly;if(e.vertical){let x1=a.x+a.w/2,y1=a.y+a.h,x2=b.x+b.w/2,y2=b.y;if(y2<y1){y1=a.y;y2=b.y+b.h;}d=`M${x1} ${y1} C${x1} ${(y1+y2)/2},${x2} ${(y1+y2)/2},${x2} ${y2}`;lx=(x1+x2)/2+9;ly=(y1+y2)/2;}else{let x1=a.x+a.w,y1=a.y+a.h/2,x2=b.x,y2=b.y+b.h/2;d=`M${x1} ${y1} C${x1+45} ${y1},${x2-45} ${y2},${x2} ${y2}`;lx=(x1+x2)/2;ly=(y1+y2)/2-8;}return`<path data-edge="${esc(e.id)}" class="edge ${esc(e.kind||'static')}" d="${d}" marker-end="url(#arrowhead)"/><text class="edge-label" x="${lx}" y="${ly}" text-anchor="middle">${esc(e.label||e.kind||'')}</text>`;}).join('');
}
function applyTransform(){$('canvas').style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;$('zoomLabel').textContent=Math.round(zoom*100)+'%';}
function fit(){const shell=$('graphShell');const w=Math.max(1330,...nodes.map(n=>n.x+n.w+30)),h=Math.max(725,...nodes.map(n=>n.y+n.h+40));zoom=Math.min((shell.clientWidth-20)/w,(shell.clientHeight-40)/h,1.2);pan={x:(shell.clientWidth-w*zoom)/2,y:7};$('canvas').style.width=w+'px';$('canvas').style.height=h+'px';$('edges').setAttribute('width',w);$('edges').setAttribute('height',h);applyTransform();}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
const examples={
handler:{kind:'CLIENT FUNCTION',label:'handleSaveCustomer()',subtitle:'버튼 클릭에서 시작되는 실행 진입점',path:'src/app/customers/page.tsx:42',code:'42  async function handleSaveCustomer() {\n43    const result = await createCustomer(input);\n44    setCustomers(result);\n45  }',detail:'정적 핸들러 연결 + 실행 계측이 있어야 관측으로 승격합니다.'},
api:{kind:'HTTP REQUEST',label:'POST /api/customers',subtitle:'요청과 응답 경계를 분리해서 확인합니다',path:'src/lib/api/customers.ts:18',code:'{\n  "method": "POST",\n  "path": "/api/customers",\n  "headers": {\n    "authorization": "[REDACTED]"\n  },\n  "body": {"name": "[REDACTED]"}\n}',detail:'요청 본문은 기본 수집하지 않습니다. 여기 표시된 JSON은 마스킹 예시입니다.'},
service:{kind:'SERVER FUNCTION',label:'createCustomer()',subtitle:'백엔드 함수 → DB · 캐시 호출',path:'src/services/customer.service.ts:28',code:'28  async function createCustomer(input) {\n29    const result = await insertCustomer(input);\n30    await invalidateCustomerCache();\n31    return result;\n32  }',detail:'브라우저 이벤트만으로는 서버 내부 함수 실행을 알 수 없습니다. 서버 계측이 별도로 필요합니다.'},
supabase:{kind:'DATABASE / API',label:'Supabase · customers',subtitle:'API 경계와 내부 SQL 경계를 구분합니다',path:'src/lib/supabase.ts:7',code:'{\n  "provider": "supabase",\n  "operation": "insert",\n  "provenance": "remote",\n  "environment": "unknown",\n  "contentAuthenticity": "unknown"\n}',detail:'원격 DB에도 seed나 테스트 레코드가 있을 수 있습니다. 원격 응답은 운영 실데이터의 증명이 아닙니다.'},
fixture:{kind:'DATA ORIGIN / FIXTURE',label:'sampleCustomers[]',subtitle:'외부 요청 대신 반환될 수 있는 예시 데이터',path:'src/mocks/customers.ts:4',code:'4  export const sampleCustomers = [\n5    { id: "fixture-001", name: "Example" }\n6  ];\n\n// 실행된 fallback 분기까지 확인해야 합니다.',detail:'파일 이름은 후보 근거입니다. 실제 반환 출처가 관측되거나 명시적 마커가 있어야 fixture 사용을 확정합니다.'},
redis:{kind:'CACHE',label:'Redis · customer:*',subtitle:'캐시 저장 위치와 원본 출처는 별개입니다',path:'src/lib/cache.ts:12',code:'{\n  "storage": "redis",\n  "operation": "DEL",\n  "key": "customer:[REDACTED]",\n  "sourceLineage": "unknown"\n}',detail:'캐시 HIT 자체를 실데이터로 분류하지 않습니다. 원본 lineage가 없으면 출처 미확인 상태를 유지합니다.'},
firestore:{kind:'DATABASE',label:'Firestore · analytics',subtitle:'SDK 발견 · 실행 여부 미확인',path:'src/lib/firebase.ts:3',code:'{\n  "basis": "static-import",\n  "runtimeObserved": false,\n  "fromCache": "unknown",\n  "hasPendingWrites": "unknown"\n}',detail:'Firestore 로컬 캐시·미전송 쓰기와 원격 서버 확인을 분리해야 합니다.'}
};
function inspect(id,forceTab){selected=id;if(forceTab)tab=forceTab;document.querySelectorAll('.node').forEach(n=>n.classList.toggle('selected',n.dataset.id===id));const node=nodes.find(n=>n.id===id)||staticIndex?.byId.get(id);if(!node)return;const ex=mode==='demo'?(examples[id]||{kind:node.type,label:node.label,subtitle:'프로젝트 구조와 실행 증거를 연결합니다',path:node.path,code:JSON.stringify({kind:node.kind,basis:'demo',runtime:'simulated'},null,2),detail:'이 노드는 UI 시연용 예시입니다. 실제 프로젝트 분석 결과와 혼합하지 않습니다.'}):{kind:node.kind.toUpperCase(),label:node.label,subtitle:'실제 파일에서 읽은 정적 분석 결과',path:node.path+(node.line?':'+node.line:''),code:JSON.stringify({basis:node.basis,status:node.status||'statically-discovered',runtime:'not-instrumented',sourceRef:node.sourceRef||null},null,2),detail:'선언/호출 관계를 코드에서 발견했습니다. 실행 사실을 뜻하지 않습니다. 자세한 제한은 coverage에 포함됩니다.'};
const linked=(mode==='static'?staticGraph.edges:edges).filter(e=>e.source===id||e.target===id).length;
$('inspectBody').innerHTML=`<div class="inspect-type">${esc(ex.kind)}</div><div class="inspect-title mono">${esc(ex.label)}</div><div class="inspect-subtitle">${esc(ex.subtitle)}</div><div class="inspect-tabs"><button class="${tab==='details'?'active':''}" data-itab="details">개요</button><button class="${tab==='source'?'active':''}" data-itab="source">소스</button><button class="${tab==='payload'?'active':''}" data-itab="payload">데이터</button></div><div class="kv-label">SOURCE LOCATION</div><div class="pathbox">${esc(ex.path)}</div><div class="kv-label">EVIDENCE</div><div class="kv"><span>근거 종류</span><b>${mode==='demo'?'DEMO · 시연':'STATIC · 실제 코드'}</b></div><div class="kv"><span>실행 확인</span><b>${mode==='demo'?'시뮬레이션':'계측되지 않음'}</b></div><div class="kv"><span>연결된 관계</span><b>${linked}개</b></div><div class="kv"><span>환경 / 내용 진위</span><b>미확인 / 미확인</b></div><div class="kv-label">${tab==='payload'?'DATA BOUNDARY':tab==='source'?'SOURCE PREVIEW':'CODE / METADATA'}</div><pre class="codeblock">${esc(tab==='payload'?id==='api'?examples.api.code:JSON.stringify({capture:'metadata-only',requestBody:'not-collected',dataProvenance:id==='fixture'?'fixture-example':'unknown'},null,2):ex.code)}</pre><div class="insight"><strong>${id==='fixture'?'더미 데이터 판정 근거':'확인 범위'}</strong>${esc(ex.detail)}</div><button class="evidence-link" id="focusRelated">${icon('network')} 연결된 노드만 강조</button>`;
$('inspectBody').querySelectorAll('[data-itab]').forEach(b=>b.onclick=()=>inspect(selected,b.dataset.itab));$('focusRelated').onclick=()=>{const ids=new Set([id]);edges.filter(e=>e.source===id||e.target===id).forEach(e=>{ids.add(e.source);ids.add(e.target);});document.querySelectorAll('.node').forEach(n=>n.classList.toggle('dim',!ids.has(n.dataset.id)));toast('연결된 노드를 강조했습니다. Esc 키로 전체를 표시합니다.');};
}
function renderTrace(){const max=Math.max(1,...trace.map(t=>t.start+t.duration));$('traceRows').innerHTML=trace.map((t,i)=>`<div class="trace-row"><div class="trace-name"><span class="trace-order">0${i+1}</span>${esc(t.name)}</div><div class="bar-track"><div class="trace-bar ${t.kind||''}" style="left:${t.start/max*78}%;width:${Math.max(1,t.duration/max*78)}%"></div></div><span class="mono muted">${t.duration} ms</span><span class="pill ${t.status==='ERROR'?'red':t.status==='FIXTURE'?'amber':'green'}">${esc(t.status)}</span></div>`).join('');}
async function runDemo(){if(mode!=='demo'||running)return;running=true;const epoch=++runEpoch;$('runBtn').disabled=true;document.querySelectorAll('.edge').forEach(e=>e.classList.remove('on','fail'));document.querySelectorAll('.node').forEach(n=>n.classList.remove('activated','dim'));trace=[];const scenario=$('scenario').value;$('traceTitle').textContent=route+' · click → response';$('traceBadge').textContent='SIMULATION';$('traceDetail').textContent='합성 타임라인 · 실제 실행 시간 아님';const steps=scenario==='mock'?[['page','e1','click / save',0,1,'OK','blue'],['handler','e2','handleSaveCustomer',1,2,'OK',''],['api','e6','API failure → fallback',3,90,'ERROR','red'],['fixture','e6','return sampleCustomers',93,1,'FIXTURE','amber']]:scenario==='error'?[['page','e1','click / save',0,1,'OK','blue'],['handler','e2','handleSaveCustomer',1,2,'OK',''],['api','e3','POST /api/customers',3,126,'ERROR','red'],['service','e3','validation error',4,125,'ERROR','red']]:[['page','e1','click / save',0,1,'OK','blue'],['handler','e2','handleSaveCustomer',1,2,'OK',''],['api','e3','POST /api/customers',3,146,'OK','blue'],['service','e4','createCustomer',6,141,'OK',''],['supabase','e4','Supabase / insert',9,112,'OK',''],['redis','e5','Redis / invalidate',124,9,'OK','']];
for(const [nid,eid,name,start,duration,status,kind]of steps){if(epoch!==runEpoch)break;document.querySelector(`[data-id="${nid}"]`)?.classList.add('activated');document.querySelector(`[data-edge="${eid}"]`)?.classList.add('on',...(status==='ERROR'?['fail']:[]));trace.push({name,start,duration,status,kind,source:'simulation'});renderTrace();await new Promise(r=>setTimeout(r,250));}
if(epoch===runEpoch){inspect(scenario==='mock'?'fixture':scenario==='error'?'api':'supabase');toast(scenario==='mock'?'더미 폴백 예시: 요청 실패 후 fixture가 반환되는 경로입니다.':scenario==='error'?'오류 예시: 요청 실패를 성공처럼 표시하지 않습니다.':'시연이 끝났습니다. 외부 API나 DB는 호출하지 않았습니다.');}running=false;$('runBtn').disabled=mode!=='demo';}
function showView(view){
if(view==='runtime')void runtimeView.refresh();
if(view==='provenance'){if(mode==='demo')$('provenanceView').innerHTML=demoProvenance;else $('provenanceView').innerHTML='<h2>실제 폴더의 출처 후보</h2><p>정적 분석의 후보일 뿐, 실제 실행이나 데이터 진위를 확정하지 않습니다.</p>'+((staticGraph?.findings||[]).map(f=>`<article class="route-card" style="margin-top:14px"><h3>${esc(f.kind)}</h3><p class="mono">${esc(f.file)}${f.line?':'+f.line:''}</p><p>${esc(f.reason)}</p><span class="pill amber">${esc(f.certainty)}</span></article>`).join('')||'<p>현재 규칙에 일치한 후보가 없습니다. 더미 데이터가 없다는 증명은 아닙니다.</p>');}
document.querySelectorAll('.overlay').forEach(el=>el.classList.remove('open'));if(view!=='graph')$(view==='help'?'helpView':view+'View').classList.add('open');document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}
function chooseRoute(url){scanEpoch++;$('searchResults').hidden=true;$('search').value='';if(running){runEpoch++;running=false;}route=url;mode='demo';$('projectName').textContent='example-crm';$('projectBadge').textContent='개발용 예시';$('filetree').innerHTML=demoFileTree;$('workspaceTitle').textContent='코드의 연결을 눈으로 확인하세요.';$('workspaceSubtitle').textContent='페이지부터 데이터까지, 한 번의 클릭을 따라갑니다.';selected='handler';trace=[];$('traceTitle').textContent='실행 타임라인';$('traceBadge').textContent='대기 중';$('traceDetail').textContent='시연 전용 · 실제 네트워크 요청 없음';$('traceRows').innerHTML='<div class="empty-trace">페이지의 저장 버튼을 눌러 시연을 시작하세요.</div>';showView('graph');drawGraph();if(url.includes('['))toast('동적 패턴의 예시 인스턴스입니다: /products/demo-001');}
function setGraphWindow(focusId) {
  const view = graphWindow(staticIndex, {focusId});
  const counters = {}, columns = {project:20,route:290,file:550,function:830,resource:1120};
  nodes = view.nodes.map(node => {
    const i = counters[node.kind] || 0; counters[node.kind] = i + 1;
    return {...node, x:columns[node.kind] ?? 1120, y:45+i*144, w:230, h:120,
      type:node.kind.toUpperCase(), footer:node.status || '정적 분석 · 실행 미확인',
      icon:node.kind==='project'||node.kind==='file'?'folder':node.kind==='resource'?'db':node.kind==='route'?'browser':'code'};
  });
  edges = view.edges.map(edge => ({...edge,label:edge.kind,kind:'static'}));
  selected = focusId || nodes.find(node => node.kind==='function')?.id || nodes[0]?.id;
  drawGraph();
  if (view.omittedNeighbors) toast(`인접 노드 ${view.omittedNeighbors}개가 표시 범위를 넘습니다. 전체 검색과 내보내기로 확인하세요.`);
}
function focusStaticNode(id) {
  showView('graph'); setGraphWindow(id); $('searchResults').hidden=true;
  if(innerWidth<=900) $('inspector').classList.add('mobile-open');
}
function renderSearch() {
  const query=$('search').value.trim();
  if(mode!=='static'||!staticIndex||!query){
    $('searchResults').hidden=true;
    document.querySelectorAll('.node').forEach(el=>{
      const node=nodes.find(n=>n.id===el.dataset.id);
      el.classList.toggle('dim',!!query&&!`${node.label} ${node.path}`.toLowerCase().includes(query.toLowerCase()));
    });
    return;
  }
  const result=searchGraph(staticIndex,query,{offset:searchOffset,limit:30});
  $('searchResults').hidden=false;
  $('searchResults').innerHTML=result.nodes.map(node=>`<button class="search-result" data-search-node="${esc(node.id)}"><b>${esc(node.label)}</b><small>${esc(node.path)} · ${esc(node.kind)}</small></button>`).join('')+
    `<div class="search-pages"><button class="btn" id="searchPrev" ${searchOffset===0?'disabled':''}>이전</button><span role="status">전체 ${result.total}개 결과 · ${result.total?searchOffset+1:0}–${Math.min(searchOffset+30,result.total)}</span><button class="btn" id="searchNext" ${searchOffset+30>=result.total?'disabled':''}>다음</button></div>`;
  $('searchResults').querySelectorAll('[data-search-node]').forEach(button=>button.onclick=()=>focusStaticNode(button.dataset.searchNode));
  $('searchPrev').onclick=()=>{searchOffset=Math.max(0,searchOffset-30);renderSearch();};
  $('searchNext').onclick=()=>{searchOffset+=30;renderSearch();};
}
async function scan(){
  showView('graph');$('scanBtn').disabled=true;
  const epoch=++scanEpoch;
  try{
    await authReady;
    const response=await sessionClient.request('/api/graph');
    if(!response.ok)throw new Error(response.status===401?'터미널에서 auth를 입력해 새 로그인 링크를 여세요.':response.status===503?'분석 시간 상한에 도달했습니다. 프로젝트 범위를 줄여 다시 시도하세요.':'분석 서버에 연결할 수 없습니다.');
    const result=await response.json();
    if(epoch!==scanEpoch)return;
    staticIndex=createGraphIndex(result);staticGraph=result;mode='static';runEpoch++;running=false;
    $('search').value='';$('searchResults').hidden=true;
    $('projectBadge').textContent='정적 분석';$('projectName').textContent=staticGraph.root.split(/[\\/]/).pop();
    $('workspaceTitle').textContent='실제 프로젝트 · 정적 연결';$('workspaceSubtitle').textContent=staticGraph.root;
    $('traceTitle').textContent='실행 타임라인';$('traceBadge').textContent='NOT INSTRUMENTED';$('traceDetail').textContent='실제 실행 이벤트 수집 없음';
    $('traceRows').innerHTML='<div class="empty-trace">실제 함수 실행은 아직 수집하지 않습니다. 현재는 소스 코드의 정적 연결입니다.</div>';
    $('filetree').innerHTML='<div class="tree-item muted">분석된 실제 파일 · 전체는 검색으로 확인</div>'+staticGraph.nodes.filter(n=>n.kind==='file').slice(0,20).map(n=>`<div class="tree-item mono" title="${esc(n.path)}">${esc(n.path)}</div>`).join('');
    const coverage=staticGraph.coverage;
    $('coverageSummary').textContent=`${coverage.status==='partial'?'부분 분석':'지원 범위 내 분석 완료'} · ${coverage.files}개 파일 · ${coverage.reasons.join(', ')||'상한/읽기 누락 없음'} (범위·제한 보기)`;
    $('coverageDetails').innerHTML='<p>지원하는 JS/TS 소스 범위의 상태입니다. 전체 애플리케이션이나 실제 실행의 완전성을 뜻하지 않습니다.</p>'+staticGraph.notices.map(n=>`<p>${esc(n.kind)} · ${esc(n.path||n.file||'')} ${n.partial?'(부분 분석 사유)':'(제외 정책)'}</p>`).join('')+(coverage.suppressedNotices?`<p>추가 알림 ${coverage.suppressedNotices}개 생략. 전체 사유 종류는 요약에 유지됩니다.</p>`:'')+coverage.limitations.map(text=>`<p>${esc(text)}</p>`).join('');
    setGraphWindow();toast(`${coverage.files}개 파일 분석 · 전체 ${staticGraph.nodes.length}개 노드 검색 가능${coverage.status==='partial'?' · 누락 사유를 확인하세요.':''}`);
  }catch(error){toast(error.message);}finally{$('scanBtn').disabled=false;}
}
window.addEventListener('message',e=>{const f=$('demoFrame');if(mode==='demo'&&f&&e.source===f.contentWindow&&e.origin==='null'&&e.data?.type==='open-view:demo'&&e.data.nonce===frameNonce)runDemo();});
document.addEventListener('click',e=>{const sr=e.target.closest('[data-static-route]');if(sr){focusStaticNode(sr.dataset.staticRoute);return;}const rb=e.target.closest('[data-route]');if(rb){chooseRoute(rb.dataset.route);return;}const nav=e.target.closest('[data-view]');if(nav){showView(nav.dataset.view);return;}const node=e.target.closest('.node');if(node){if(node.dataset.id==='route-orders')return chooseRoute('/orders');if(node.dataset.id==='route-settings')return chooseRoute('/settings');inspect(node.dataset.id);if(innerWidth<=900)$('inspector').classList.add('mobile-open');}const edge=e.target.closest('[data-edge]');if(edge){const d=edges.find(x=>x.id===edge.dataset.edge);if(d){inspect(d.target,'payload');toast(`${d.label||d.kind} · ${mode==='demo'?'시연 연결':'정적 분석 연결'}`);}}});
let drag=null;$('graphShell').addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button,select,iframe,.legend'))return;const head=e.target.closest('.node-head');const n=head?nodes.find(n=>n.id===head.closest('.node').dataset.id):null;if(e.target.closest('.node')&&!n)return;drag={n,sx:e.clientX,sy:e.clientY,x:n?n.x:pan.x,y:n?n.y:pan.y};$('graphShell').setPointerCapture(e.pointerId);});$('graphShell').addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;if(drag.n){drag.n.x=drag.x+dx/zoom;drag.n.y=drag.y+dy/zoom;const el=document.querySelector(`[data-id="${drag.n.id}"]`);el.style.left=drag.n.x+'px';el.style.top=drag.n.y+'px';paintEdges();}else{pan={x:drag.x+dx,y:drag.y+dy};applyTransform();}});$('graphShell').addEventListener('pointerup',()=>drag=null);$('graphShell').addEventListener('pointercancel',()=>drag=null);
$('zoomIn').onclick=()=>{zoom=Math.min(2.5,zoom*1.2);applyTransform();};$('zoomOut').onclick=()=>{zoom=Math.max(.15,zoom/1.2);applyTransform();};$('fitBtn').onclick=fit;new ResizeObserver(()=>fit()).observe($('graphShell'));
$('search').oninput=()=>{searchOffset=0;renderSearch();};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}if(e.key==='Escape'){$('searchResults').hidden=true;$('search').value='';document.querySelectorAll('.node').forEach(n=>n.classList.remove('dim'));showView('graph');$('inspector').classList.remove('mobile-open');}if((e.key==='Enter'||e.key===' ')&&e.target.matches('.node')){e.preventDefault();inspect(e.target.dataset.id);}});
$('runBtn').onclick=runDemo;$('scanBtn').onclick=scan;$('staticMode').onclick=scan;$('demoMode').onclick=()=>{mode='demo';runEpoch++;running=false;$('projectName').textContent='example-crm';$('workspaceTitle').textContent='코드의 연결을 눈으로 확인하세요.';$('workspaceSubtitle').textContent='페이지부터 데이터까지, 한 번의 클릭을 따라갑니다.';chooseRoute(route);};$('helpBtn').onclick=()=>showView('help');$('backToMap').onclick=()=>showView('graph');$('closeInspector').onclick=()=>{$('inspector').classList.remove('mobile-open');document.querySelectorAll('.node').forEach(n=>n.classList.remove('dim'));};
$('exportBtn').onclick=()=>{const out=mode==='demo'?{schemaVersion:1,mode:'demo',disclaimer:'All graph data and traces are simulated examples.',nodes,edges,trace}:structuredClone(staticGraph);if(mode==='static'){const root=out.root;out.root='<project-root>';out.nodes=out.nodes.map(n=>({...n,path:n.path===root?'<project-root>':n.path}));}const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`open-view-${mode}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('현재 모드와 판정 근거를 포함해 내보냈습니다.');};
$('logoutBtn').onclick=async()=>{
  try { await authReady; await sessionClient.logout(); runtimeView.clear(); toast('로그아웃했습니다. 터미널에서 auth를 입력하면 새 로그인 링크를 받습니다.'); }
  catch { toast('로컬 세션을 지웠습니다. 서버에 연결할 수 없습니다.'); }
};
const authReady=(async()=>{
  const capability=new URLSearchParams(location.hash.slice(1)).get('token');
  if(capability){
    history.replaceState(null,'',location.pathname+location.search);
    try { await sessionClient.bootstrap(capability); }
    catch(error) { toast(error.message); }
  }
})();
renderRouteNav();drawGraph();
