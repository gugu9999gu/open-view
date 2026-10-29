# 구현 상태 — 0.2.0

## 현재 구현

0.1.1의 인증·worker 정적 분석·부분 분석 안내·전체 검색·DEMO/STATIC 분리를 유지한다. 0.2.0은 명시적 계측 기반 실제 실행 경로를 추가했다.

| 영역 | 지원 범위 |
|---|---|
| 수집기 | 메모리 보관, 스키마 검증, 순서 역전·중복 처리, 프로젝트/런타임/페이지/종류 제한, 상한·만료·손실 표시 |
| 권한 | UI 세션은 조회/전체 삭제, Agent 토큰은 ingest 전용. 페이지 relay 토큰과 실제 ingest 토큰 분리 |
| Browser SDK | 명시적 traceAction, 중첩 span, 허용 origin fetch. 전역 API 패치 없음 |
| Node SDK | AsyncLocalStorage, HTTP traceparent v00, 명시적 함수 span |
| PostgreSQL | 단일 client의 BEGIN/쿼리/COMMIT/ROLLBACK. COMMIT 응답 유실은 unknown |
| 개발 예제 | 실제 React/Vite UI, Node 업무 API, loopback 전용 DB. 4가지 저장/실패 시나리오 |
| 실행 UI | OBSERVED 목록/상세, 부모 span·시간·저장/업무/출처 차원·손실 표시, 새로고침·삭제 |
| 운영 빌드 | 예제의 production alias는 no-op. 수집 경로/trace 헤더/런타임 식별 표식과 source map 미포함 검사 |

## 검증된 범위

코드 head `10e0a0c3a0e65350eef145f0e8a148d2b770e10e`, CI run `40834192100`:

- Node/실제 HTTP 66/66, PostgreSQL 통합 9/9(부모 테스트 포함 Node 집계).
- 기존 실제 브라우저 회귀 14/14, React → PostgreSQL 브라우저 검사 12/12.
- JavaScript 36개 구문·인코딩 검사, npm ci, leerness verify, production 3개 파일/6개 금지 표식 검사 통과.
- CI 소스 자동 수정 없음. 보관 artifact SHA-256: `d9484a2f84b371e463ed6ac9af7efa5c19604293c082020059bee8cfc8d417a2`.

이후 변경은 해당 head의 CI 결과로 다시 검증한다. 로컬에서는 Node/HTTP·빌드·구문·harness 검사가 통과했지만 브라우저 navigation은 관리자 정책으로 차단되었다. 실제 PostgreSQL/브라우저 통과 근거는 위 CI다. Windows/macOS와 사용자의 임의 프로젝트는 미검증이다.

## 진행률과 남은 것

[고정된 인수 기준](RUNTIME-DEVELOPMENT.ko.md) R01–R10 통과, R11–R12 미구현: **10/12 = 83.3%**. 이는 실제 저장 경로 단계의 기준 충족률이며 전체 제품·공수 진행률이 아니다.

다음 두 항목은 미구현이다: runtime build manifest ↔ 정적 sourceRef의 정확한 연결, HMR 전후 과거 소스 보존 및 그래프 노드 실행 강조. 현재 이름/시간으로 소스를 추정 연결하지 않으며 `sourceMapping: not-linked`를 반환한다.

임의 프로젝트 자동 설치·모든 함수 자동 계측·DOM 데이터 lineage·OTel 수신·Supabase/Redis/Firestore/호스팅 커넥터·지속 저장·VS Code/MCP·운영 서비스 배포도 미구현이다. 수동 새로고침은 라이브 스트리밍 UI가 아니다.

## 운영상 제한

신뢰한 로컬 개발 환경만 대상이다. OBSERVED는 Agent 보고이지 위변조 방지 증명이 아니다. 기본 보관 5,000개 이벤트/30분, Agent 64개, Vite 페이지 세션 32개다. Agent 만료 후 자동 갱신은 없으며 예제를 재시작한다. 입력/본문/SQL/결과 행/원시 오류는 수집하지 않지만 span label은 개발자가 안전한 정적 이름으로 지정해야 한다.

종료 이벤트만 수집하므로 프로세스 강제 종료 직전 손실을 완전 탐지하지 못한다. 큐 초과/전송 실패를 보고하되 완전성은 best-effort로 유지한다. 예제 HMR은 세션 폐기·새 build ID·전체 새로고침이며 핫 상태 보존/과거 소스 매핑을 의미하지 않는다.

0.1.1의 [보안·정적 분석 계약](HARDENING-AND-CONTRACTS.ko.md)과 기존 검증 기록은 해당 버전의 역사 기록으로 유지한다. 현재 런타임 계약과 실행법은 [개발 기록](RUNTIME-DEVELOPMENT.ko.md), [실행 안내](RUNTIME-QUICKSTART.ko.md)를 따른다.
