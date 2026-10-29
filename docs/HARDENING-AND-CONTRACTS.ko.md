# 검수 보강과 구현 계약 — 0.1.1

기준: `6f6689b2c40ae337c5f25d6a4f6ca2e7317192b5`의 설계 검수, 2026-10-29.
사용자 요청: 검수 내용을 보강하고 개발 진행. 이번 변경은 로컬 프로토타입의 보안·정확성·회귀 검증을 먼저 보강한다. **임의 프로젝트의 실시간 추적을 구현했다고 주장하지 않는다.**

## 1. 현재 구현된 인증 계약

기본 UI 주소는 `http://127.0.0.1:4418`이다. OTLP의 4317/4318을 UI 기본값으로 사용하지 않는다. 포트 충돌 시 명시적 오류와 `--port 0` 안내를 제공한다. 서버는 loopback에만 바인딩한다.

| 경로 | 자격 증명 | 결과 |
|---|---|---|
| `POST /api/session` | bootstrap Bearer | 서로 다른 UI accessToken과 expiresAt 반환 |
| `GET /api/graph`, `/api/config` | UI Bearer | 조회 전용 |
| `DELETE /api/session` | UI Bearer | 서버 세션 철회 |

Bootstrap은 32바이트 난수이며 5분 후 만료된다. 검증과 소비는 비동기 작업 전에 원자적으로 수행한다. 이미 사용한 토큰·세션 토큰을 bootstrap으로 재사용할 수 없다. 터미널에서 `auth`를 입력하면 기존 미사용 링크를 폐기하고 새 링크를 출력한다. TTY가 아닌 실행 환경에서는 서버 재시작으로 새 링크를 받는다.

UI 세션은 8시간 동안 유효하며 서버에서 만료를 검사한다. 최대 8개를 유지하고 초과 발급 시 가장 오래된 세션을 철회한다. 서버 종료 시 모두 폐기한다. 메모리에는 자격 증명의 SHA-256 digest만 보관한다. UI는 sessionStorage에 accessToken을 보관하고 저장소 사용이 차단되면 탭 메모리로 동작한다. Bootstrap은 저장하지 않으며 fragment는 인증 요청 전에 제거한다.

UI 요청은 같은 origin의 `/api/`에만 Authorization을 명시적으로 추가한다. `credentials: omit`, `mode: same-origin`, `redirect: error`를 강제한다. 대상 웹앱 요청, 다른 포트, iframe, JSON export에는 UI 토큰을 전달하지 않는다. 쿠키 인증은 거부한다. 이전 버전의 `ov_session` 쿠키가 HTML 요청에 있을 때만 삭제용 만료 쿠키를 반환하며 새 비밀값은 쿠키에 저장하지 않는다.

Host·Origin·Sec-Fetch-Site 검사, CSP nonce, frame-ancestors 제한을 적용한다. 공개 서버·LAN·터널·임의 프록시 배포는 지원하지 않는다. sessionStorage도 동일 origin XSS에는 읽힐 수 있다. 쿠키 제거는 같은 호스트의 다른 포트에 자격 증명이 자동 전달되는 문제를 해결하는 것이며, 악성 로컬 프로세스나 악성 브라우저 확장 프로그램에 대한 완전한 격리가 아니다.

## 2. 정적 분석 완전성과 실행 격리

`coverage.status`의 `complete`는 **지원하는 소스 파일 범위 안에서 상한/읽기 누락이 발견되지 않았음**을 뜻한다. 전체 앱 분석, 실행 관측, 완전한 타입/데이터 흐름 증명을 뜻하지 않는다. 파일 접근 실패·깊이/개수/크기/시간 상한·파서 진단은 `partial`과 사유를 남긴다. `truncated`는 기존 소비자를 위한 호환 필드이며 partial일 때 true다.

파일 1,500개, 파일당 512KiB, 합계 24MiB, 깊이 20, 디렉터리 3,000개, 엔트리 30,000개, 탐색 10초, 개별 알림 200개가 기본 상한이다. 알림을 생략해도 사유 종류와 생략 수는 유지한다. 점 파일, symlink, 의존성/빌드 디렉터리는 명시적 제외 정책이다.

디렉터리 엔트리는 스트리밍으로 읽고 파일 읽기도 상한을 둔다. TypeScript 분석은 별도 worker에서 실행하며 서버 경로에는 30초 종료 기한과 512MiB V8 old-generation 상한을 둔다. 이는 전체 프로세스 RSS 보장이나 보안 sandbox가 아니다. 종료 기한/워커 오류는 HTTP 실패이며 완전한 그래프로 위장하지 않는다. 동일 서버에서 중첩된 스캔 요청은 진행 중 작업을 공유한다.

신뢰한 로컬 개발 폴더가 대상이다. 악성 프로세스가 상위 디렉터리나 파일을 경합 변경하는 환경에 대한 완전한 TOCTOU 격리, 파일시스템 전체의 원자적 스냅샷은 제공하지 않는다.

## 3. 전체 그래프와 화면 표시 분리

분석 응답 전체가 검색 대상이다. 초기 캔버스만 100개로 제한한다. 검색 결과는 30개씩 페이지를 이동하며 전체 결과 수를 표시한다. 결과를 선택하면 해당 노드와 직접 연결된 이웃을 다시 투영한다. 이웃도 상한을 넘으면 생략 수를 표시한다. Inspector의 관계 수는 전체 그래프 기준이다. 라우트 목록에서 화면 밖 노드를 선택하는 경우에도 동일한 포커스 경로를 사용한다. Export는 화면 부분집합이 아닌 전체 분석 응답이다.

UI를 ES module로 분리했으므로 `file://` 직접 열기는 더 이상 실행 경로가 아니다. `npm start`로 제공한다. 기존 화면 구성과 DEMO/STATIC의 의미는 유지한다.

## 4. 소스 정의와 실행 인스턴스 계약

### 현재 정적 분석

Graph schemaVersion은 2다. 내용 기반 `sourceSnapshotId`와 함수의 `sourceRef`를 추가했다.

```ts
type StaticSourceRef = {
  projectId: string;
  sourceSnapshotId: string; // static:<content digest>, 실제 runtime build ID가 아님
  moduleId: string;         // 루트 상대 경로
  definitionId: string;     // 해당 스냅샷 안의 함수 정의 ID
  start: number;            // TypeScript UTF-16 offset
  end: number;
};
```

동일 소스 집합이면 같은 snapshot ID를 얻고, 소스 변경 시 새 ID를 얻는다. 함수 ID에도 스냅샷이 반영되므로 편집 전후 위치가 잘못 합쳐지지 않는다. 부분 스캔은 받아들인 파일 집합의 스냅샷일 뿐 프로젝트 전체 build ID가 아니다. sourceSnapshotId는 `coverage`와 함께 해석한다.

### 런타임 단계의 필수 계약 — 아직 미구현

컴파일러 플러그인이 `projectId / buildId / moduleId / definitionId`와 원본 위치를 연결하는 manifest를 만든다. SDK 이벤트는 `runtimeInstanceId / pageInstanceId / interactionId / traceId / spanId / parentSpanId`를 가진다. 같은 컴포넌트의 반복 렌더링, 같은 URL의 여러 탭, HMR 전후를 분리한다. manifest가 없는 실행을 가까운 타임스탬프나 함수명만으로 정적 정의에 확정 연결하지 않는다.

빌드 간 비교용 logicalSymbolId는 별도이며 선택적이다. 모호한 익명 함수나 이름 중복을 임의로 합치지 않는다. HMR 후 이벤트가 이전 buildId를 가리키면 이전 manifest로 보여주고, 해당 manifest가 없으면 소스 미확인 상태다.

## 5. 통신과 추적 전파 계약

현재는 `lib/observation-contract.mjs`의 순수 검증/판정 함수만 있다. fetch 패치, SDK, collector endpoint는 **아직 없다**.

업무 요청 경로와 telemetry 수집 경로를 분리한다. 업무 API에는 정확한 origin allowlist와 서버 CORS 지원이 모두 확인된 경우에만 traceparent를 추가한다. 수집기 origin과 `/__open_view/` 요청은 계측 전파에서 제외한다. redirect의 최종 목적지를 다시 검증하지 못하면 명시적 수동 래퍼는 redirect를 허용하지 않는다. 지원되지 않는 경계는 연결 미확인으로 남긴다. 현재 parser의 지원 범위는 W3C traceparent version 00이다.

브라우저 telemetry는 우선 Vite 개발서버의 전용 중계 경로로 전달하고, 중계 서버가 collector로 보낸다. UI 세션을 재사용하지 않으며 프로젝트·환경·런타임 인스턴스에 제한된 ingest-only 자격 증명을 사용한다. Agent 자격 증명은 graph/source 조회나 UI 로그인에 사용할 수 없어야 한다.

목표 event envelope에는 eventId, schemaVersion, projectId, buildId, runtimeInstanceId, sequence, trace/span/parent IDs, interactionId, wall-clock timestamp, monotonic duration, droppedCount를 둔다. collector는 eventId 중복 제거와 out-of-order 수신을 처리한다. 누락은 droppedCount·sequence gap으로 표시하며 시각적 연결을 추정으로 보충하지 않는다. 요청 본문·쿠키·Authorization·SQL 파라미터·원시 오류 메시지는 기본 수집하지 않는다. 전송 큐와 batch에는 상한을 두며 실패가 업무 요청을 실패시키면 안 된다.

## 6. DB 작업과 저장 성공 판정

각 차원은 독립적으로 보존한다. 미관측은 실패가 아니라 unknown이다.

| 차원 | 상태 |
|---|---|
| transport | unknown / response / network-error / cancelled |
| operation | unknown / succeeded / failed |
| transaction | unknown / committed / rolled-back / not-applicable |
| business | unknown / succeeded / failed |
| dataOrigin | unknown / remote / fixture / cache / mixed |

`persistenceStatus`는 transaction의 committed/rolled-back 증거만 확인 상태로 승격한다. HTTP 응답·쿼리 성공만으로 저장을 확정하지 않는다. INSERT 후 ROLLBACK은 rollback-confirmed다. COMMIT 후 캐시 무효화 실패 또는 fixture 반환이 발생하더라도 커밋 사실은 보존한다. 서로 다른 트랜잭션·재시도·캐시 작업은 별개의 이벤트로 유지해야 한다. 관리형 서비스에서 커밋 경계를 관측하지 못하면 unknown이며 임의로 성공/실패를 보완하지 않는다.

이 함수의 테스트 통과는 실제 PostgreSQL 또는 관리형 DB의 계측 완료를 뜻하지 않는다.

## 7. 다음 구현 단계의 인수 기준

React/Vite + Node + 로컬 PostgreSQL 예제 하나에서 명시적 traceAction/traceFunction 래퍼로 시작한다. 초기 목표는 자동 계측의 폭이 아니라 정확한 한 경로다.

- 실제 클릭 → 핸들러 → API → 서버 함수 → DB 작업과 트랜잭션 결과가 동일 trace에 연결되어야 한다.
- 동시 클릭과 polling, 여러 탭을 서로 합치지 않아야 한다.
- INSERT 후 rollback, commit 후 후속 작업 실패, fixture fallback을 독립 판정해야 한다.
- collector 중단·queue drop·취소·redirect·HMR에서도 대상 앱의 동작을 바꾸지 않아야 한다.
- 운영 빌드에는 agent, collector 주소, source manifest, 인증 정보가 남지 않아야 한다.

이 경로가 검증된 뒤 Supabase/Redis/Firestore/Next.js와 호스팅 어댑터를 확장한다.

## 공식 근거

- RFC 6265 §8.5: 쿠키는 포트별 격리 수단이 아니다. https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5
- W3C Trace Context: 교차 origin 헤더 전파는 CORS와 함께 검증해야 한다. https://www.w3.org/TR/trace-context/
- PostgreSQL Transactions: 개별 명령 성공과 최종 COMMIT/ROLLBACK은 다르다. https://www.postgresql.org/docs/current/tutorial-transactions.html
- GitHub Actions security: 최소 토큰 권한. https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
