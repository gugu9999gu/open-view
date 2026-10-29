# 구현 상태 — R11/R12 소스 연결 후속 개발

## 현재 구현

0.1.1의 인증·worker 정적 분석·전체 검색과 0.2.0의 명시적 Browser/Node SDK·PostgreSQL 경로에 소스 매핑과 HMR 이력 그래프를 추가했다. PR #3은 PR #2 기반이며 main 병합·배포는 하지 않았다. 패키지 버전은 0.2.0으로 유지하고 이번 변경은 Unreleased로 기록한다.

| 영역 | 지원 범위 |
|---|---|
| 수집기/권한 | 메모리 보관, 스키마·순서 역전·중복·상한·만료·손실 표시, UI 조회/삭제와 Agent ingest 권한 분리 |
| Browser/Node | 명시적 action/span/fetch, 허용 origin 전파, Node AsyncLocalStorage, 동시 context 분리 |
| PostgreSQL | 같은 client의 BEGIN/쿼리/COMMIT/ROLLBACK, 응답 유실 unknown, 후속 오류와 커밋 분리 |
| 소스 매핑 | 선택된 inline callback의 파일 해시·AST 위치, scanner와 동일 sourceRef, project/build/definition 검증 |
| 소스 보관 | 선택된 원본 코드만 bounded memory 보관, UI 인증 조회, 만료·삭제 시 현재 파일로 대체하지 않음 |
| HMR | Vite 변경 시 새 build와 전체 reload. 보관된 과거 소스 유지. Node 모듈은 시작 시 고정 |
| 실행 UI | OBSERVED 목록/상세/삭제, trace별 버전 고정 함수 그래프, 실행 노드 강조, 원본 코드/줄 보기 |
| 운영 빌드 | 예제 production no-op alias, 수집·trace·source manifest 표식 및 source map 제외 검사 |

## 검증된 범위

코드 `256d6db884902bff0861db45c4d2e12aa080b5dc`, CI `40845242282`:

- Node/실제 HTTP 82/82, PostgreSQL 9/9(부모 포함), 기존 browser 14/14, React/DB/HMR browser 17/17.
- JavaScript 42개 구문·인코딩 검사, npm ci, leerness verify, production 3개 파일/9개 개발 표식 부재.
- 실제 Vite 소스 수정 후 과거 trace의 원본 코드와 새 trace의 변경 코드가 분리되고 DB 저장도 유지됨을 확인.
- 소스 API의 UI/Agent 권한 분리, record 삭제, TTL/capacity 및 source graph의 추정 연결 방지 검사.
- CI가 추적 소스를 변경하지 않는 검사 통과. [근거 JSON](validation-source-mapping.json).

문서 등 후속 커밋은 해당 head CI로 다시 확인한다. 로컬 Chromium navigation은 관리자 정책으로 차단됐다. 이를 모의 통신으로 대체하지 않았으며 실제 PostgreSQL/브라우저 근거는 CI다. Windows/macOS 및 사용자 임의 프로젝트는 미검증이다.

## 단계 진행률

[고정된 12개 인수 기준](RUNTIME-DEVELOPMENT.ko.md) **12/12 = 100%**. 실제 저장 경로 단계의 기준 충족률이며 전체 제품 완성률 또는 공수 비율이 아니다. 원래 제품의 자동 설치·다중 프레임워크·클라우드 지원은 별도 개발이다.

## 아직 미구현 또는 제한되는 범위

임의 프로젝트 자동 설치, 모든 함수 자동 계측, DOM 데이터 lineage, OpenTelemetry 수신, Supabase/Redis/Firestore/호스팅 커넥터, 지속 저장, VS Code/MCP, 운영 배포는 미구현이다. 실행 UI는 수동 새로고침이다. 소스 그래프는 해당 trace에서 확인된 정의만 표시하며 전체 STATIC 그래프의 라이브 재생은 아니다.

소스 매핑은 명시적 inline callback과 선택된 파일에 한정한다. HMR은 전체 reload라서 React 입력 상태가 초기화된다. Node hot reload는 없다. 개발용 Node loader는 상대/`node:` 정적 import만 지원한다. 상세: [소스 연결 계약](SOURCE-MAPPING.ko.md).

## 보관과 개인정보 경계

이벤트 기본 보관은 5,000개/30분, Agent 64개, 페이지 relay 32개다. 만료 자동 갱신은 없고 재시작이 필요하다. 종료 이벤트만 수집하므로 강제 종료 직전 손실을 완전 탐지할 수 없으며 완전성은 best-effort다. OBSERVED는 신뢰한 개발용 Agent의 보고다.

소스 기본 보관은 128개 버전/30분, 메타데이터를 포함한 8 MiB 예산이다. 선택한 파일 원본의 상수·SQL 문자열·주석은 보관될 수 있다. 이벤트 본문에서 입력/SQL/결과 행을 제외하는 정책과 혼동하지 않는다. 소스는 UI 인증으로만 조회하고 삭제·종료 시 함께 폐기한다. 만료/누락 시 `not-retained`이며 최신 파일로 추측 연결하지 않는다.

이전 버전의 검증 기록과 변경 이력은 역사 자료로 유지한다. 현재 계약은 [개발 기록](RUNTIME-DEVELOPMENT.ko.md), [실행 안내](RUNTIME-QUICKSTART.ko.md)를 따른다.
