# 구현 상태 — 외부 프로젝트 연결 O01–O10

## 현재 구현

인증·정적 분석·명시적 Browser/Node/PG 추적·소스/HMR 이력에 외부 프로젝트 연결 CLI와 Vite 어댑터를 추가했다. PR #4는 PR #3 기반이며 main 병합·배포·공개 npm 배포는 하지 않았다. 패키지 버전은 0.2.0으로 유지하고 이번 변경은 Unreleased로 기록한다.

| 영역 | 지원 범위 |
|---|---|
| 수집기/권한 | 메모리 보관, 스키마·순서 역전·중복·상한·만료·손실 표시, UI 조회/삭제와 Agent ingest 권한 분리 |
| Browser/Node | 명시적 action/span/fetch, 허용 origin 전파, Node AsyncLocalStorage, 동시 context 분리 |
| PostgreSQL | 같은 client의 BEGIN/쿼리/COMMIT/ROLLBACK, 응답 유실 unknown, 후속 오류와 커밋 분리 |
| 소스 매핑 | 선택된 inline callback의 파일 해시·AST 위치, scanner와 동일 sourceRef, project/build/definition 검증 |
| 소스 보관 | 선택된 원본 코드만 bounded memory 보관, UI 인증 조회, 만료·삭제 시 현재 파일로 대체하지 않음 |
| HMR | Vite 변경 시 새 build와 전체 reload. 보관된 과거 소스 유지. Node 모듈은 시작 시 고정 |
| 실행 UI | OBSERVED 목록/상세/삭제, trace별 버전 고정 함수 그래프, 실행 노드 강조, 원본 코드/줄 보기 |
| 운영 빌드 | 공개 browser export의 기본 no-op, 개발에서만 alias. 검증 앱의 개발 표식·source map 부재 검사 |
| 외부 프로젝트 | init 미리보기/배타적 JSON 생성, 비실행 doctor, --trust-project dev, 대상 설치 Vite/React 진단 |
| 패키지 소비 | 로컬 npm pack/tarball 설치, 공개 bin/exports, 독립 root 브라우저·기존 API·원본/HMR 검사 |

## 검증된 범위

코드 `e7e408674a99611e25ea527db7099d2aa2e33e3d`, CI `40853572299`:

- Node/실제 HTTP 97/97, PostgreSQL 9/9(부모 포함), 기존 browser 14/14, React/DB/HMR browser 17/17, 외부 소비 앱 browser 12/12.
- JavaScript 49개 구문·인코딩, npm ci, leerness verify, production 제외 검사, 추적 소스 무변경 통과.
- 실제 npm tarball을 저장소 밖 별도 경로에 설치하고 npm ci/CLI/Vite/기존 API/실제 브라우저를 사용했다.
- 실제 파일 HMR과 과거 코드 유지, 미선택 파일의 미매핑, 수집 중단 후 앱 작동, 오류 의미·권한 경계를 검증했다.
- CI archive 121개 파일과 로컬 코드 commit 바이트 일치. [근거 JSON](validation-project-connection.json).

문서 후속 커밋은 해당 head CI로 다시 확인한다. 로컬 npm DNS는 차단돼 있어 실제 패키지 설치·브라우저를 로컬 통과로 보고하지 않는다. 실제 PostgreSQL/브라우저 근거는 CI다. Windows/macOS와 사용자 업무 프로젝트는 미검증이다.

## 단계 진행률

[고정된 12개 인수 기준](RUNTIME-DEVELOPMENT.ko.md) **12/12 = 100%**. 실제 저장 경로 단계의 기준 충족률이며 전체 제품 완성률 또는 공수 비율이 아니다. 원래 제품의 자동 설치·다중 프레임워크·클라우드 지원은 별도 개발이다.

[외부 연결 O01–O10](PROJECT-CONNECTION.ko.md)은 별도 **9/10 = 90%**. O10은 사용자 실제 업무 프로젝트 검증이며 생성한 소비 앱으로 대체하지 않는다.

## 아직 미구현 또는 제한되는 범위

외부 프로젝트는 수동 패키지 설치/명시적 래퍼만 지원한다. 임의 프로젝트 무설정 자동 설치, 모든 함수 자동 계측, DOM 데이터 lineage, OpenTelemetry 수신, Supabase/Redis/Firestore/호스팅 커넥터, 지속 저장, VS Code/MCP, 운영 배포는 미구현이다. 실행 UI는 수동 새로고침이다. 소스 그래프는 해당 trace에서 확인된 정의만 표시하며 전체 STATIC 그래프의 라이브 재생은 아니다.

소스 매핑은 명시적 inline callback과 선택된 파일에 한정한다. HMR은 전체 reload라서 React 입력 상태가 초기화된다. Node hot reload는 없다. 개발용 Node loader는 상대/`node:` 정적 import만 지원한다. 상세: [소스 연결 계약](SOURCE-MAPPING.ko.md).

## 보관과 개인정보 경계

이벤트 기본 보관은 5,000개/30분, Agent 64개, 페이지 relay 32개다. 만료 자동 갱신은 없고 재시작이 필요하다. 종료 이벤트만 수집하므로 강제 종료 직전 손실을 완전 탐지할 수 없으며 완전성은 best-effort다. OBSERVED는 신뢰한 개발용 Agent의 보고다.

소스 기본 보관은 128개 버전/30분, 메타데이터를 포함한 8 MiB 예산이다. 선택한 파일 원본의 상수·SQL 문자열·주석은 보관될 수 있다. 이벤트 본문에서 입력/SQL/결과 행을 제외하는 정책과 혼동하지 않는다. 소스는 UI 인증으로만 조회하고 삭제·종료 시 함께 폐기한다. 만료/누락 시 `not-retained`이며 최신 파일로 추측 연결하지 않는다.

이전 버전의 검증 기록과 변경 이력은 역사 자료로 유지한다. 현재 계약은 [개발 기록](RUNTIME-DEVELOPMENT.ko.md), [실행 안내](RUNTIME-QUICKSTART.ko.md)를 따른다.
