# Open View — 웹 프로젝트 시각화·실행 검증 도구 설계

설계 기준일: 2026-10-29 · 문서 버전: 0.1.1 · 상태: 제품 설계 + 조작형 UI 프로토타입 + 제한된 정적 분석 서버

> **완료 범위:** 조작 가능한 예시 페이지, 노드 맵, 합성 타임라인, 더미 폴백/오류 시연, 실제 JS/TS 폴더의 정적 분석. **미완료 범위:** 임의 프로젝트에 자동 설치되는 런타임 SDK, 실제 DB/호스팅 연결 검증, 모든 함수 자동 계측. 이 문서의 목표 기능을 현재 구현으로 해석하지 않는다.

> 0.1.1의 인증·정적 소스 식별·부분 분석·검색·실행 전파·저장 판정에 대한 구체적 계약은 [검수 보강과 구현 계약](HARDENING-AND-CONTRACTS.ko.md)을 따른다. 해당 문서는 구현된 항목과 다음 런타임 단계의 목표를 구분한다.

## 1. 제품 정의

Open View는 개발 중인 웹 프로젝트의 **페이지 → UI 이벤트 → 소스 함수 → API → 서버 함수 → 데이터 저장소 → 응답 → 화면 갱신**을 하나의 탐색 가능한 그래프로 연결하는 로컬 개발 도구다. 단순한 서버 모니터링이나 아키텍처 그림이 아니라, 코드 구조와 관측된 실행 증거를 나란히 보여준다.

핵심 질문은 “무엇이 연결되어 있는가?”, “이번 클릭에서 실제로 무엇이 실행되었는가?”, “어느 파일의 어느 함수인가?”, “데이터는 어디에서 왔으며 무엇은 아직 모르는가?”다. AI가 생성한 UI가 샘플 배열만 보여주고 있는지, API 요청 뒤 오류를 숨기고 fixture를 반환하는지, DB 쓰기 성공 전에 성공 메시지를 보여주는지 확인하는 데 집중한다.

사용 대상은 AI와 함께 웹을 개발하는 개인·소규모 개발팀이다. 우선 한 PC와 한 프로젝트를 지원한다. 클라우드 계정 전체 관리, 운영 DB 편집, 코드 자동 수정, 자동 배포는 최초 제품 범위에서 제외한다.

## 2. 반드시 분리할 네 가지 정보

| 정보 계층 | 알아내는 것 | 알아낼 수 없는 것 | 표시 방식 |
|---|---|---|---|
| 코드 구조 | 파일, 선언, import, 정적으로 해석 가능한 호출 | 이번에 실행되었는지 | STATIC / 점선 |
| 실행 관측 | 계측된 클릭, 함수 진입·종료, 요청, 응답, 오류 | 계측되지 않은 내부 함수 | OBSERVED / 실선·시간 |
| 구성 정보 | 설정된 DB·호스팅 대상, SDK 의존성 | 실제 연결 성공·물리 서버 내부 | CONFIGURED / 회색 |
| 데이터 출처 | fixture, mock handler, remote response, cache, 변환 계보 | 데이터의 업무적 진위 전부 | 출처+환경+증거 배지 |

이 네 계층에 **DEMO**를 별도로 둔다. 예시 데이터는 어떤 상황에서도 실제 분석 결과로 승격하지 않는다. 추정 연결은 observed 그래프에 합치지 않는다. 실행이 관측되지 않았다는 이유만으로 “사용하지 않는 코드”라고 단정하지 않는다.

## 3. 설치와 실행 경험

### 목표 제품의 사용 흐름 — 아직 배포된 명령이 아님

1. 개발 프로젝트 루트에서 Open View 초기화 명령 실행.
2. 대상 루트와 개발 서버 URL, 개발 환경 여부를 확인.
3. 프레임워크 탐지 → 지원 범위와 미지원 항목 표시.
4. 설정 파일과 계측 변경 diff 미리보기. 승인된 파일만 수정하며 기존 instrumentation과 병합.
5. 사용자가 평소 개발 서버를 실행하고 Open View 서버를 별도 실행.
6. 콘솔에 출력된 일회성 인증 URL로 Open View에 접속.
7. 페이지 노드를 활성화하여 직접 조작. 실제 실행 경로를 선택된 trace에서만 강조.
8. 노드/간선 클릭 → 파일·라인·근거·요청·응답·오류 확인.
9. 제거 명령은 Open View가 생성한 변경만 되돌림. 사용자 수정 내용은 보존.

목표 명령의 형태는 `open-view init`, `open-view dev`, `open-view doctor`, `open-view remove`로 설계한다. **현재 npm에 이 CLI를 배포했다는 뜻이 아니다.**

### 현재 저장소에서 실행하는 방법

```bash
npm ci
npm start
# 기본 대상: examples/demo-project

# 별도 프로젝트의 소스 구조만 분석
npm start -- --project "/absolute/path/to/my-web-project" --port 4418
```

Windows의 예: `npm start -- --project "C:\\workspace\\my-web-project" --port 4418`.
터미널의 `http://127.0.0.1:4418/#token=...` 전체 URL로 접속한다. 로그인 링크는 5분 내 한 번만 사용 가능하며, 인증 후 주소에서 제거된다. 별도의 UI Bearer 세션을 발급하고 sessionStorage에 보관한다. 쿠키 인증은 사용하지 않는다. 세션은 서버 기준 8시간 만료이며 로그아웃으로 철회한다. 터미널의 `auth` 명령으로 새 링크를 발급한다. 초기 화면은 UI 시연이며 **폴더 분석**을 눌러야 실제 정적 분석 결과가 보인다. 현재 서버는 대상 코드를 실행하지 않으며 개발 서버를 대신 시작하지 않는다.

## 4. 전체 아키텍처

```text
개발 프로젝트 폴더                           개발 웹 서버 :3000
  ├─ 소스 / 라우트 / 승인된 설정                ├─ Browser SDK [계획]
  ├─ Source Map + build revision              ├─ JSX/함수 계측 플러그인 [계획]
  └─ 파일 변경 감시 [계획]                     └─ Node/Edge SDK [계획]
          │ 구조 분석                                  │ 실행 이벤트
          ▼                                            ▼
  Project Analyzer ───────────► Local Collector / Graph Engine
  (TS AST / adapter)           ├─ 인증·스키마 검증·마스킹·수집 상한
                               ├─ 정적 그래프와 실행 그래프의 연결
                               ├─ 출처 판정 + 증거 저장
                               ├─ SQLite / 분할 trace 저장 [계획]
                               └─ HTTP + SSE/WS [계획]
                                            │
                                            ▼
                          Open View UI :4418
                          파일 트리 / 페이지 노드 / 함수·API·DB
                          Inspector / Timeline / Data provenance
```

분석 대상 DB에 Open View 데이터를 저장하지 않는다. 최초 저장소는 프로젝트별 `.open-view/`의 SQLite와 필요 시 크기 제한된 trace 파일을 권장한다. 현재 프로토타입은 분석 결과를 메모리에서 반환하며 지속 저장·스트리밍은 없다.

React + TypeScript + React Flow를 정식 UI의 기본안으로 잡는다. React Flow의 custom node 및 `nodrag`/`nopan` 상호작용을 활용하고, ELK 계열 레이아웃 엔진은 대규모 자동 배치의 후보로 둔다. 현재 시안은 외부 CDN 없이 HTML/CSS/ES module과 SVG로 구현하고 로컬 서버에서 제공한다. file:// 직접 실행은 지원하지 않는다. 이는 정식 프레임워크 구현과 구분한다.

## 5. 노드와 연결의 도메인 모델

**노드 종류:** Workspace, Project, Folder, File, Module, Component, Function, RoutePattern, PageInstance, UIAction, Request, Endpoint, ServerRuntime, Database, Collection/Table, Cache, ExternalAPI, Queue/Job, HostingTarget, DataSource, Transform.

**연결 종류:** contains, declares, imports, renders, handles-event, calls, sends-request, handles-request, queries, reads, writes, invalidates, returns, updates-state, renders-value, deployed-to, runs-on, falls-back-to, derived-from. 코드에서 import한 관계와 실제 호출 관계는 같은 간선으로 대체하지 않는다.

노드의 식별자는 프로젝트 ID + 상대 파일 경로 + 심볼 식별자 + 빌드 버전으로 설계한다. 파일 라인만으로 장기 식별하지 않는다. 코드가 바뀌면 과거 trace에는 당시의 revision을 유지하고 최신 코드와 불일치를 표시한다. 현재 scanner는 내용 기반 sourceSnapshotId와 함수별 sourceRef를 구현했다. 이는 정적 소스 스냅샷이며 실제 런타임 buildId, HMR 매핑, 버전 간 논리 ID는 아직 없다.

```ts
// 목표 스키마. 현 정적 프로토타입의 schemaVersion:2와 구분되는 런타임 목표 설계이다.
type EvidenceKind = 'static' | 'runtime' | 'config' | 'manual' | 'demo';
interface Evidence {
  id: string;
  kind: EvidenceKind;
  collector: string;
  buildId?: string;
  traceId?: string;
  spanId?: string;
  file?: string;
  startLine?: number;
  observedAt?: string;
  limitation?: string;
}
interface DataProvenance {
  origin: 'remote' | 'fixture' | 'mock' | 'cache' | 'generated' | 'mixed' | 'unknown';
  environment: 'development' | 'test' | 'staging' | 'production' | 'unknown';
  contentKind: 'business' | 'seed' | 'synthetic' | 'mixed' | 'unknown';
  certainty: 'explicit' | 'observed' | 'inferred' | 'unknown';
  evidenceIds: string[];
  parentSourceIds: string[];
}
```

“원격 Supabase / staging / seed / explicit”처럼 각 차원을 독립 표시한다. 단일 `isReal: true` 플래그는 사용하지 않는다.

## 6. 모든 하위 URL을 다루는 방법

“하위 URL 모두”는 **발견된 라우트 패턴 전체를 등록**한다는 뜻으로 구현해야 한다. `/products/[id]`, `/search?q=...`의 가능한 모든 URL은 유한한 목록이 아니다.

RoutePattern과 PageInstance를 분리한다. 패턴은 `/products/[id]`, 인스턴스는 `/products/demo-001`, 역할은 `admin`, viewport는 `desktop`, 방문 상태는 `not-visited | rendered | blocked | error`다. 패턴에 구체 파라미터가 없으면 URL을 임의 생성하지 않는다. 사용자 지정 사례·안전한 기존 링크·테스트 fixture에서만 예시를 얻는다.

1차 어댑터는 React/Vite 명시 라우트 설정과 Node API를 대상으로 설계한다. Next.js App/Pages Router는 별도 어댑터로 확장하고 route groups, dynamic/catch-all, middleware redirect, SSR/RSC, Server Actions, parallel/intercepting routes를 각각 테스트한다. 현재 scanner는 `app/**/page.*`와 `pages/**`의 제한된 파일 규칙만 인식한다. React Router 설정 전체를 이미 해석하지 않는다.

**모든 페이지를 동시에 iframe으로 띄우지 않는다.** 기본은 썸네일 또는 경로 카드이며 선택한 1개, 최대 2개의 페이지만 활성화한다. 비활성화해도 초기 마운트 시 이미 수행된 API 호출이 취소되는 것은 아니므로 사용자 명시적 활성화가 우선이다. 로그인·폴링·WebSocket·자동 저장·조회 비용을 관리한다. 카드 목록을 가상화하고 보이는 노드만 렌더링한다.

## 7. 조작 가능한 웹페이지 노드

페이지 노드는 세 모드를 갖는다. **구조 보기**는 미리보기/스크린샷만, **조작하기**는 클릭을 대상 iframe으로 전달, **요소 선택**은 버튼·입력 필드에 overlay를 표시하고 해당 이벤트 핸들러의 소스로 이동한다. 노드를 이동하는 동작과 웹페이지 안을 조작하는 동작이 충돌하지 않도록 헤더만 drag handle로 사용한다.

서로 다른 포트는 서로 다른 origin이다. iframe DOM을 부모가 무제한 읽는 구조를 사용하지 않는다. 대상 개발 앱에 Browser SDK를 설치하고 `postMessage`는 origin, source window, 세션 nonce, 메시지 스키마를 검증한다. 실제 telemetry 통신에서는 `targetOrigin='*'`를 사용하지 않는다.

CSP `frame-ancestors`, `X-Frame-Options`, OAuth 리다이렉트, 쿠키 제한 때문에 iframe이 불가능할 수 있다. 그때는 **별도 탭에서 실제 페이지를 조작하고 Open View에서 추적**하는 연결 모드를 제공한다. 개발용 설정 변경은 허용할 정확한 origin만 추가하고 사용자 승인 뒤 적용한다. 보안 헤더 전체 삭제나 운영 사이트 프록시 우회를 기본 해결책으로 사용하지 않는다.

현재 시안의 iframe은 외부 사이트가 아닌 자체 생성한 예시 HTML이며 `sandbox=allow-scripts`로 격리한다. 이 시연에 한해 opaque origin과 frame source, nonce를 확인한다. 로컬 서버가 제공하는 데모 메시지는 민감 정보 없는 고정 이벤트뿐이다. 이 방식은 실서비스 SDK 통신의 보안 설계를 대신하지 않는다.

## 8. 버튼 → 함수 → 요청의 정확한 연결

클릭을 관측한 시각과 가장 가까운 fetch를 묶는 방식은 사용하지 않는다. 연속 클릭, 자동 재시도, polling, debounce, 병렬 요청에서 잘못된 연결을 만들기 때문이다.

클릭마다 `interactionId`를 발급하고 브라우저 함수 span → HTTP client span → server span → DB/client span에 trace context를 연결한다. 프로세스 사이에는 W3C Trace Context를 사용하고 동일한 trace ID 아래 여러 span을 둔다. interactionId와 traceId는 의미가 다르며, 하나의 인터랙션이 여러 trace나 비동기 job과 연결될 경우 span link를 사용한다.

브라우저 비동기 context 전파는 프레임워크/도구 버전에 따라 제약이 있다. OpenTelemetry 공식 JS 문서도 브라우저 계측을 실험적이라고 설명한다. 초기 제품은 계측된 클릭 핸들러와 명시적 async 경계만 우선 지원하고, 전파가 끊기면 `correlation=unknown`으로 표시한다. 글로벌 `lastClickId`를 두는 편법은 금지한다.

브라우저 fetch/XHR 계측은 네트워크 경계를 알려주지만 내부 모든 함수의 실행을 자동으로 알려주지 않는다. 정확한 함수 추적은 다음을 병행한다.

- AST에서 JSX 이벤트와 핸들러 심볼 연결. 함수명 문자열 비교가 아니라 scope·import alias·선언을 해석.
- 개발 전용 컴파일러 변환으로 선택된 함수의 entry/exit/error를 삽입. 원본 코드 파일은 덮어쓰지 않음.
- 지원되지 않는 경계는 명시적 `traceFunction`/`traceAction` 래퍼로 연결.
- source map + 빌드 ID로 실행 위치를 원본 파일·라인에 대응. source map 자체가 실행 계측은 아님.

변환은 `this`, return 값, 동기 예외, Promise rejection, async/await, generator, recursion, closure의 의미를 보존해야 한다. 모든 함수를 async 래퍼로 바꾸면 동작이 달라지므로 금지한다. 초기에는 앱의 핸들러·서비스·repository 함수만 계측하고 node_modules·getter·render loop는 제외한다. React Strict Mode나 HMR 때문에 발생한 개발 실행을 UI에서 구분한다.

## 9. 요청·응답·화면 갱신 시각화

Request Inspector는 요청 method·정규화된 URL·상태·duration·size·trace/span ID·호출한 함수·대상 서비스·마스킹된 스키마를 보여준다. 요청과 응답을 탭으로 나누고 실패·취소·timeout·retry를 구분한다. `200 OK`와 업무 성공은 별개이며 응답 스키마의 오류도 나타낸다.

배경 요청은 interaction에서 분리한다. response body를 단순히 읽었다는 이유로 그 데이터가 화면에 표시되었다고 판정하지 않는다. UI 바인딩까지 표시하려면 state setter/selector/component rendering을 계측하는 별도 어댑터가 필요하다. 최초에는 “응답 수신”까지만 확정하고 화면 갱신의 인과 관계는 unknown으로 남길 수 있다.

타임라인은 이미 수집한 기록을 스크럽하는 것이다. 되감기/재생 버튼이 POST·결제·이메일 발송을 재실행하면 안 된다. 요청 재실행은 별도 기능이며 기본 비활성, 사용자 승인, 개발환경, 부작용 안내가 필요하다.

프로세스별 소요 시간은 단조 시계로 계산한다. 다른 프로세스의 시작 시각은 clock skew가 있으므로 wall-clock만으로 정확한 순서를 주장하지 않는다. 부모/자식 관계와 duration을 우선한다.

## 10. DB·캐시·호스팅 연결 범위

| 대상 | 기본 관측 | 확장 관측 | 표시해야 할 한계 |
|---|---|---|---|
| Supabase | supabase-js/HTTP/RPC 호출 경계 | 지원 trace/log 연동 또는 직접 pg client span | HTTP 성공으로 내부 SQL 전체를 재구성하지 않음 |
| Firestore | 문서/컬렉션 작업·SDK 결과·snapshot metadata | Cloud Functions 서버 span/로그 | 캐시 결과·pending write·서버 확인 구분 |
| Redis | Node client command·duration·cache hit/miss·invalidations | 원본 source lineage | 캐시 데이터도 fixture일 수 있음 |
| 직접 PostgreSQL | client query span, 작업 종류 | 권한 있는 별도 DB 지표 연동 | SQL 파라미터/개인정보 기본 제외 |
| Hosting | 로컬 프로세스/포트·배포 설정/manifest | 읽기 전용 provider API의 배포 상태 | 설정상 대상과 실제 배포·가동 상태 구분 |

Supabase의 client tracing을 사용할 때도 SDK 버전과 trace 전달 설정을 확인한다. API Gateway/Edge 경계와 내부 DB query는 다른 관측 영역이다. Firestore는 `fromCache`, `hasPendingWrites` 등으로 로컬 응답·서버 반영을 구분한다. Redis에는 개발용 계측 어댑터를 우선 사용하며, 모든 명령/민감 값을 노출할 수 있는 MONITOR를 기본 활성화하지 않는다.

호스팅은 컨테이너/VM·관리형 서버리스·edge worker를 모두 “서버 한 대”로 동일 표시하지 않는다. 처음에는 runtime, deployment target, configured provider로 구분하고 물리 인프라 위치를 추정하지 않는다. 클라우드 쓰기 권한을 요구하지 않는다.

## 11. 더미·샘플 데이터 판정 엔진

핵심 제품 차별점은 “가짜처럼 보이는 데이터를 AI가 추측”하는 것이 아니라 **반환 출처에 근거를 붙이는 것**이다.

**확정 가능한 증거:** 명시적 fixture marker, 실행된 mock interceptor, 관측된 fallback에서 fixture 모듈 반환, 사용자가 선언한 seed manifest, 데이터 생성 테스트 어댑터. 그래도 외부 운영 데이터의 업무적 진위까지 보증하지는 않는다.

**후보 증거:** `mocks/`, `fixtures/`, `seed/` 경로, Faker/MSW import, 특정 fallback 코드. 후보가 실제 런타임에 사용되는지는 별도 확인한다.

**단독 판정 금지:** 배열 리터럴, 고정 숫자, 이름이 “홍길동”, API 요청이 존재함, 응답이 200, URL이 supabase.co, 캐시 HIT. 정당한 상수나 테스트 서버, 원격 seed 레코드가 모두 있을 수 있다.

예시 경로: 클릭 → API timeout → catch → sampleCustomers 반환 → UI success. 경고는 “DB 저장 확인 없음 / fixture 반환이 관측됨”이다. 실제 DB 쓰기 여부가 미확인인데 “저장 성공”만 강조하지 않는다.

변환·병합 데이터는 `derived-from` 계보로 여러 부모를 유지한다. WeakMap의 객체 identity만으로 문자열/숫자 복사와 직렬화 전부를 추적할 수 없다. 초기 lineage는 API/SDK/fixture/state와 같은 명시적 경계에 한정하고 arbitrary JS full taint tracking을 제품 기본 약속으로 삼지 않는다.

## 12. 화면·UX 상세

### A. 프로젝트 맵
왼쪽에 프로젝트·경로·페이지 목록, 중앙에 zoom/pan 가능한 맵, 오른쪽에 Inspector, 아래에 Timeline을 둔다. 화면 위에는 대상 환경과 관측 모드, 연결 상태를 항상 표시한다. `DEMO`, `STATIC`, `OBSERVED`는 색상 외에 텍스트로 표시한다.

중앙 흐름은 Project/Page → Function → HTTP/Server → Resource 순서다. 구조도에서는 많은 노드를 그룹화하고, 사용자가 클릭 trace를 선택했을 때 해당 경로만 확대한다. 간선을 드래그하는 기능은 시각적 배치나 메모일 뿐 코드를 바꾸지 않는다. 정적 관계를 사용자가 임의 수정해 관측 사실로 만들 수 없다.

### B. 요소 선택과 소스
버튼에 마우스를 올리면 선택 가능한 overlay를 표시한다. 선택하면 파일 상대경로·라인·export/함수·관련 trace가 열린다. IDE 열기는 등록된 root 안의 파일만, 인수 escaping과 파일 존재 검증 뒤 실행한다. 임의 shell command 입력 기능은 제공하지 않는다.

### C. Inspector
개요, 소스, 요청, 응답, 데이터 출처, 근거 탭을 둔다. 권한과 캡처 정책 때문에 수집하지 않은 값은 “미수집”으로 표시하고 빈 문자열/정상으로 대체하지 않는다. 긴 코드와 body는 가상화하고 copy/export 시 마스킹을 유지한다.

### D. 타임라인
선택된 trace의 계층, 중첩 함수, 병렬 요청, 대기, 재시도, cache hit/miss, 오류 경계를 보여준다. 빈 상태에는 “계측되지 않음 / 아직 실행하지 않음 / 수집 중단 / 지원되지 않음”을 구별한다. 수집이 끊기면 화면에 drop 수와 stale 시간을 표시한다.

### E. 데이터 출처
페이지/함수/환경별 후보 목록, 실제 사용된 fixture, remote-but-unknown, 혼합 출처, 미계측 영역을 필터링한다. 후보 없음은 “안전함”이나 “더미 없음”을 뜻하지 않는다. 정책 예외에는 사유·범위·만료일을 기록한다.

### F. 대규모/접근성
검색은 페이지·경로·함수·resource·trace ID를 지원한다. keyboard focus, Enter 선택, Esc 초기화, 색각 접근성, reduced motion을 지원한다. 좁은 화면에서는 Inspector drawer, 기본 최적 화면은 데스크톱으로 한다. 수만 개 노드를 기본 확대도로 렌더링하지 않고 package/file/function 단계별 LOD를 적용한다.

## 13. 보안과 부작용

기본은 `127.0.0.1` 바인딩, 랜덤 session capability, 정확한 Host/Origin 검사, CSRF 방어, 요청 크기/빈도 제한이다. localhost라는 이유로 인증을 생략하지 않는다. LAN 공개·터널·원격 접속은 1차 범위에서 제외한다.

.env 원문, DB 연결 비밀번호, service_role, Authorization, Cookie, 토큰, 주민번호/전화/이메일, 요청 본문은 기본 수집하지 않는다. JSON schema·타입·길이·상태부터 수집하고, 제한적인 field allowlist는 사용자가 켜야 한다. 마스킹은 브라우저/서버 agent에서 먼저 수행하고 collector에서 다시 수행한다. collector에 이미 전송한 뒤 UI에서만 숨기는 것은 마스킹으로 보지 않는다. URL query와 SQL bind values도 별도 처리한다.

스캐너는 신뢰한 프로젝트 루트만 읽는다. symlink와 루트 이탈을 차단하고 숨김 폴더, 빌드 산출물, node_modules를 제외한다. 알 수 없는 package script, JS 설정 파일, plugin을 소스 분석 목적으로 실행하지 않는다. 현재 scanner는 이러한 기본 제외와 상한을 적용하지만 같은 사용자 권한의 악성 프로세스가 파일을 경합 변경하는 상황까지 보안 격리한다고 보증하지 않는다.

**관측 도구가 읽기 전용이어도 iframe 안의 실제 앱 버튼은 DB를 바꿀 수 있다.** UI에 이 차이를 명시한다. 운영 환경은 preview 활성화 제한과 별도 경고를 두고, 테스트 계정·DB branch·emulator 사용을 우선한다. UI의 차단 버튼만으로 모든 HTTP 메서드/SDK/WebSocket 부작용을 막는다고 주장하지 않는다. 강한 write isolation이 필요하면 별도 환경과 자격 증명을 사용한다.

AI는 필수 의존성이 아니다. 원본 코드·개인정보를 외부 모델로 자동 전송하지 않는다. 추후 설명/요약 기능은 마스킹된 graph evidence만, 사용자 승인과 정책 범위 안에서 제공한다. 로컬 LLM을 연결해도 검증되지 않은 설명을 observed 상태로 바꾸지 않는다.

## 14. 서버·저장소·프로토콜 설계

목표 API는 `/v1/projects`, `/v1/graph`, `/v1/routes`, `/v1/traces`, `/v1/provenance`, `/v1/evidence`, `/v1/events`로 분리한다. 모두 schemaVersion과 project/session scope를 요구한다. 읽기 전용 조회와 agent 수집 채널의 권한을 분리한다. UI Bearer 자격 증명을 대상 iframe이나 다른 origin으로 넘기지 않고, agent에는 프로젝트/환경 제한된 수집 권한만 발급한다.

이벤트 envelope는 eventId, schemaVersion, projectId, sessionId, buildId, source, sequence, traceId/spanId/parentSpanId, interactionId, timestamp, monotonicDuration, droppedCount를 갖는다. 중복 제거, out-of-order 수신, 누락 이벤트, clock skew, 취소를 처리한다. collector 장애가 대상 앱의 오류가 되지 않도록 bounded queue + timeout + drop notice를 사용한다.

저장 테이블은 projects, revisions, files, symbols, routes, graph_nodes, graph_edges, evidence, traces, spans, provenance_sources, provenance_links, sessions, policy_exceptions로 나눈다. 인덱스는 project+revision, traceId+spanId, relativePath+symbol, observedAt을 우선한다. trace와 source snapshot의 TTL, 총량 제한, 전체 삭제를 제공한다. 원본 body는 기본 저장하지 않는다.

초기 설계 상한은 활성 iframe 1~2개, 화면 렌더 노드 300개 안팎, 표시 body opt-in 최대 32KB, 수집 batch 상한과 bounded queue로 잡는다. 이 값들은 **성능 보장 수치가 아니라 검증할 설계 시작값**이다. 현재 프로토타입은 파일 1,500개, 파일당 512KiB, 합계 24MiB, 깊이 20, 디렉터리 3,000개, 엔트리 30,000개, 탐색 10초, worker 30초, UI 표시 100개 상한을 사용한다. 전체 검색과 export는 UI 표시 상한과 분리한다.

## 15. 계측 범위와 설치 철회

지원 매트릭스를 버전별로 유지한다. Browser/Node/Edge, React/Vite/Next, Supabase/Firestore/Redis를 한 번에 “지원”으로 표시하지 않는다. 예: Supabase HTTP 경계 지원과 내부 SQL 추적 지원은 다른 항목이다.

개발 플러그인은 production build에서 포함되지 않아야 한다. release 검증에서 Open View import, collector URL, trace injection, 소스맵 경로 유출을 검사한다. 설치할 때 변경 파일의 hash와 원본 backup을 저장하고, 제거 시 사용자가 수정한 부분과 충돌하면 diff를 제시한다. 자동 강제 덮어쓰기는 하지 않는다.

## 16. 단계별 구현 계획과 통과 기준

| 단계 | 범위 | 완료 판정 |
|---|---|---|
| S0: 현재 | 설계·UI 시연·정적 분석·보안 보강 | 44개 Node/HTTP 테스트, 실제 브라우저 E2E, 부분 분석·전체 검색 |
| S0.2: 다음 | React/Vite + Node + PostgreSQL 한 경로, 명시적 래퍼 | 실제 클릭→서버→DB와 commit/rollback/fallback 구분 |
| S1: 구조 탐색 | React/Vite adapter, route manifest, 안정 symbol IDs, watcher | 실제 프로젝트의 scope/import/라우트 fixture 회귀 테스트 |
| S2: 브라우저 관측 | 클릭·fetch/XHR·오류·source mapping·선택적 핸들러 계측 | 동시 클릭 2개 및 polling이 서로 잘못 연결되지 않음 |
| S3: 백엔드·데이터 | Node API, PostgreSQL/Redis adapter, Supabase HTTP, provenance | 요청→서버→DB span 연결, 실패/재시도/캐시/fixture 증거 |
| S4: 제품화 | Next.js SSR/RSC/Server Actions, Firestore, 호스팅 읽기 연동, 패키징 | 어댑터별 버전 매트릭스·운영 안전성·회귀 테스트 |

MVP 목표는 “예시 프로젝트에서 고객 저장 버튼 한 번을 실제 client handler → API → server function → DB/client 경계로 추적하고, fixture fallback이면 경고한다”로 제한한다. 모든 언어·모든 프레임워크·완전한 데이터 taint tracking은 초기 목표로 삼지 않는다.

필수 인수 테스트:

- 동일 이름 함수가 다른 scope/파일에 있어도 선언 위치를 혼동하지 않는다.
- 병렬 클릭/재시도/취소/백그라운드 요청을 잘못 한 trace로 합치지 않는다.
- iframe이 막히면 차단 원인과 별도 탭 모드를 제공한다.
- SDK 의존성만 있는 DB를 connected/healthy로 표시하지 않는다.
- 커밋 근거 없는 fixture 반환을 저장 성공으로 표시하지 않는다. 이미 관측한 커밋은 후속 오류·fixture 반환 때문에 실패로 덮어쓰지 않는다.
- 원격 seed 데이터, 실제 enum 상수, 캐시된 fixture에 대한 오탐을 검사한다.
- 토큰/비밀번호/개인정보가 collector·저장소·export에 남지 않는지 canary로 검증한다.
- 계측 전후 함수 return/throw/this/Promise 동작과 앱 회귀 테스트 결과가 같다.
- HMR 뒤 이전 빌드 trace가 현재 코드에 잘못 매핑되지 않는다.
- 수집 중단/overflow를 숨기지 않고 미관측 범위를 표시한다.
- trace 재생이 실제 쓰기 작업을 재실행하지 않는다.

## 17. 저장소 구성과 실제 구현 상태

```text
public/index.html                 # UI 레이아웃과 스타일
public/app.mjs                    # 조작형 노드맵과 DEMO/STATIC UI
public/graph-model.mjs            # 전체 검색과 캔버스 부분집합
public/session-client.mjs         # 동일 origin UI 인증 전송
server.mjs                        # loopback 인증 + 정적 graph API
lib/auth.mjs                     # 일회용 bootstrap, 만료·철회 세션
lib/scanner.mjs                   # TypeScript 5.8.3 AST 제한 분석
lib/source-files.mjs              # 상한 있는 소스 탐색·부분 분석 사유
lib/scan-runner.mjs               # worker 격리·종료 기한
lib/observation-contract.mjs      # 저장 결과·전파 정책 순수 함수
examples/demo-project/            # 명시적인 샘플 프로젝트
test/*.test.mjs                   # 44개 Node/HTTP 회귀 테스트
scripts/check-ui.py               # 실제 브라우저→서버 E2E
artifacts/e2e/results.json        # 실행별 결과, git 제외·CI artifact
docs/ui-test-results.json         # 이전 0.1의 분리 검사 기록
docs/HARDENING-AND-CONTRACTS.ko.md # 구체적 보강·다음 단계 계약
docs/IMPLEMENTATION-STATUS.md     # 구현/미구현 경계
.leerness/                        # 프로젝트 운영 하네스
AGENTS.md / CLAUDE.md             # leerness 생성 지침
```

정식 제품에서는 cli, analyzer, graph-core, browser-agent, node-agent, compiler-plugin, adapters, ui, test-fixtures 패키지로 나눈다. 현재 ES module 시안을 그대로 거대한 정식 UI 코드베이스로 확장하지 않는다.

## 18. leerness 역할

leerness는 대상 프로젝트의 실제 실행을 관측하는 엔진이 아니라 Open View 자체 개발의 작업 상태·검증·인수인계를 관리한다. 저장소 확인 시 버전 1.36.305를 고정했다. 한국어 minimal init을 수행하고 verify 성공을 확인했다. 원본 gugu9999gu/leerness 저장소는 수정하지 않는다.

새 에이전트는 먼저 AGENTS.md와 관련 `.leerness/` 지침을 확인하고 handoff, 작업 등록, 테스트 근거, session close를 수행한다. UI 시안 승인과 제품 런타임 구현을 같은 완료 상태로 묶지 않는다. 설계 목표·실제 구현·테스트 evidence를 각각 관리한다. 승인·검수 결과를 임의 생성하지 않는다.

## 19. 현재 검증과 남은 제한

초기 0.1에서는 로컬 Linux 환경에서 Node 기본 테스트 6개, UI/HTTP 검증 15개를 실행했다. UI는 Chromium에 HTML을 주입하여 실제 DOM·iframe 버튼·시나리오·검색·zoom·export를 검사했다. API 인증/Origin/Host/파일 접근은 실제 HTTP로 별도 검사했다. 컨테이너 브라우저의 navigation 정책 때문에 **브라우저가 서버에 직접 접속하는 전체 E2E는 수행하지 못했다**. 테스트 스크립트와 JSON 결과에 이 제한을 남겼다.

Windows/macOS, 실제 사용자 프로젝트의 개발서버, Supabase/Firestore/Redis 실연결, OTel context propagation, HMR, 배포 차단은 아직 검증하지 않았다. 현재 프로토타입은 보안 감사 완료 제품이 아니므로 외부 네트워크에 공개하지 않는다.

0.1.1에서는 Node/HTTP 회귀 테스트 44개와 소스 검사 18개 모듈을 검증했다. 새 브라우저 테스트는 실제 서버 navigation을 요구한다. 로컬 환경에서는 관리자 정책으로 차단되었으며 PR Actions 결과와 artifact를 별도로 확인해야 한다. 이전 15개 UI 결과를 새 버전의 E2E 통과 근거로 재사용하지 않는다. 코드 커밋 `6b0ffdf91c30d4542346861b514af82b86e44c94`의 PR CI run `40820622011`에서는 npm ci·leerness verify·44개 Node 테스트·14개 실제 브라우저 E2E 항목이 통과했다.

## 20. 공식 기술 근거

아래 링크는 설계의 외부 기술 근거다. 위의 제품 구성·UX·정책은 제안 설계이며 공식 도구가 기본 제공한다고 주장하지 않는다.

1. React Flow custom nodes: https://reactflow.dev/learn/customization/custom-nodes
2. React Flow utility classes: https://reactflow.dev/learn/customization/utility-classes
3. OpenTelemetry JavaScript 상태: https://opentelemetry.io/docs/languages/js/
4. OpenTelemetry context propagation: https://opentelemetry.io/docs/concepts/context-propagation/
5. iframe과 same-origin: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
6. postMessage 검증: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
7. CSP frame-ancestors: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
8. Next.js server instrumentation: https://nextjs.org/docs/app/guides/instrumentation
9. Next.js client instrumentation: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
10. Supabase client tracing: https://supabase.com/docs/guides/observability/client-side-tracing
11. Firestore offline metadata: https://firebase.google.com/docs/firestore/manage-data/enable-offline
12. TypeScript compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
