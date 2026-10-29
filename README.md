# Open View

웹 프로젝트의 **페이지 → 함수 → API → DB** 관계를 눈으로 확인하는 로컬 개발 도구의 설계·프로토타입입니다.

**현재 상태: 정적 분석 + 명시적 Browser/Node 계측 + 실제 PostgreSQL 저장 추적 + 소스/HMR 이력 + 외부 Vite 프로젝트 연결 CLI·진단. 모든 함수 자동 계측은 아직 지원하지 않습니다.**

R01–R12 실제 저장 경로 단계의 인수 기준은 12/12 통과했습니다. 전체 제품 완성률은 아닙니다. 외부 프로젝트 연결은 별도 O01–O10 중 9/10(90%)이며 실제 사용자 업무 프로젝트 검증 O10이 남았습니다. PR #4는 PR #3 기반의 Unreleased 변경이며 main 병합·배포·공개 npm 배포는 하지 않았습니다.

## 실행

Node.js 22 이상이 필요합니다.

```bash
npm ci
npm start
```

터미널에 표시된 `http://127.0.0.1:4418/#token=...` 전체 URL을 여세요. 로그인 링크는 5분 내 한 번만 사용할 수 있습니다. 인증 뒤 주소에서 토큰이 제거되고 별도의 8시간 UI 세션이 탭의 sessionStorage에 저장됩니다. 쿠키로 인증하지 않습니다. 로그아웃/만료 후에는 터미널에 `auth`를 입력해 새 링크를 받으세요. 초기 화면은 **DEMO**입니다. 예시 페이지 안의 저장 버튼, 시나리오 선택, 노드/간선 선택, 검색, zoom/pan, 데이터 출처 화면을 사용할 수 있습니다. 합성 트레이스는 실제 API를 호출하지 않습니다.

```bash
npm start -- --project "/absolute/path/to/project" --port 4418
```

**폴더 분석**을 누르면 지정한 폴더의 실제 JS/TS 선언, 상대 import 기반 함수 호출, JSX 이벤트 핸들러, 제한된 파일 라우트를 읽습니다. SDK import는 실제 DB 연결의 증거가 아닙니다. 대상 파일을 수정하거나 실행하지 않습니다.

UI는 ES module로 분리되어 있으므로 `file://`로 열지 말고 서버로 접속하세요. 포트 충돌 시 `--port 0`으로 사용 가능한 포트를 선택할 수 있습니다.

전체 분석 결과를 검색할 수 있으며, 캔버스에만 최대 100개를 표시합니다. 검색 결과를 선택하면 해당 노드와 이웃을 표시합니다. 스캔 상한/읽기 오류는 **부분 분석**과 사유로 표시됩니다.

## 외부 Vite 프로젝트 연결

설치 가능한 로컬 패키지와 `init → doctor → dev` 절차를 제공한다. 공개 npm에 배포한 패키지가 아니므로 동명 레지스트리 패키지를 설치하지 않는다.
저장소에서 `npm pack --ignore-scripts`로 만든 `open-view-0.2.0.tgz`를 대상 프로젝트에 설치한 뒤 실행한다.

```bash
# 대상 프로젝트 폴더에서; 실제 tarball 경로와 source 파일로 변경
npm install --save-dev /absolute/path/to/open-view/open-view-0.2.0.tgz
npx --no-install open-view init --source src/App.jsx
npx --no-install open-view init --source src/App.jsx --write
npx --no-install open-view doctor --json
npx --no-install open-view dev --trust-project
```

init 기본값은 미리보기다. --write는 신규 JSON만 생성하며 기존 설정을 덮어쓰지 않는다.
doctor는 프로젝트 설정/스크립트를 실행하지 않고 .env를 읽지 않는다. dev는 신뢰한 기존 Vite 설정·플러그인을 실행한다.
설치/파일 선택만으로 추적되지 않으며 `open-view/browser`의 명시적 래퍼를 적용해야 한다.
검증 범위는 Node22/Vite7/React19, 단일 root, base=/, 루프백 HTTP다. 기존 소스·Vite config·npm scripts의 자동 수정은 하지 않는다.
패키지 설치 자체의 package.json/lockfile 변경은 npm의 정상 동작이다. 원본 소스의 비밀값 제거를 보장하지 않는다.

[설치·계측·운영 경계 및 10개 기준](docs/PROJECT-CONNECTION.ko.md) · [검증 기록](docs/validation-project-connection.json)

## 실제 실행 예제

전용 로컬 DB를 준비한 후 실행합니다. `.env` 자동 탐색이나 운영 DB 자동 연결은 하지 않습니다.

```bash
# 아래 연결 정보는 예시입니다. 전용 로컬 DB 정보를 명시하세요.
export OPEN_VIEW_EXAMPLE_DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:5432/open_view_example'
npm run example:runtime
```

터미널의 `loginUrl`과 `appUrl`을 열고 저장 버튼을 누른 뒤, Open View의 **실제 실행 → 새로고침**에서 확인합니다. 정상 커밋·롤백·커밋 후 오류·fixture 반환을 별도로 관측합니다. 이 명령은 예제 DB에 실제 레코드를 저장합니다. 일반 `npm start` 정적 분석은 여전히 대상 DB/파일을 변경하지 않습니다.

실행 상세의 소스 그래프에서 강조된 노드를 선택하면 실행 당시 원본 함수·파일·줄 번호를 확인합니다. Vite 코드를 바꾸면 새 build로 전체 reload되며 과거 trace는 보관된 옛 코드를 유지합니다. React 상태 보존형 HMR과 Node hot reload는 지원하지 않습니다.

선택적으로 보관하는 원본에는 코드에 적힌 상수·SQL 문자열도 포함될 수 있습니다. 이벤트 메타데이터와 별도이며 UI 인증으로만 조회합니다.

[DB 준비부터 실행까지](docs/RUNTIME-QUICKSTART.ko.md) · [12개 인수 기준과 진행률](docs/RUNTIME-DEVELOPMENT.ko.md)

## 문서

- [외부 프로젝트 연결 및 지원 범위](docs/PROJECT-CONNECTION.ko.md)
- [상세 제품 설계](docs/PRODUCT-DESIGN.ko.md)
- [구현 상태와 한계](docs/IMPLEMENTATION-STATUS.md)
- [정확한 소스 연결·HMR 이력 계약](docs/SOURCE-MAPPING.ko.md)
- [소스 연결 검증 기록](docs/validation-source-mapping.json)
- [검수 보강과 구현 계약](docs/HARDENING-AND-CONTRACTS.ko.md)
- [0.1.1 로컬 검증 기록](docs/validation-0.1.1.json)
- [초기 0.1 UI/HTTP 검사 기록 — 현재 E2E 결과 아님](docs/ui-test-results.json)

## 테스트

```bash
npm run check
npm test
# 실제 브라우저 → 로컬 서버 E2E
python -m pip install -r scripts/requirements-test.txt
python -m playwright install chromium
npm run test:e2e
```

E2E는 인증·쿠키 비사용·다른 포트 격리·실제 스캔·100개 이후 검색·export·로그아웃을 실제 HTTP로 검사합니다. 브라우저 접속이 차단된 환경에서는 실패를 기록하며 모의 통신으로 대체하지 않습니다. 결과는 `artifacts/e2e/results.json`에 남깁니다.

PR 검증은 `contents: read`, `npm ci`, 실제 E2E를 사용하고 소스를 자동 수정하거나 커밋하지 않습니다. 0.2.0부터 별도의 PostgreSQL 서비스와 React 브라우저 E2E도 실행합니다. `npm run test:integration`에는 실제 DB 연결이 필요하며, `npm run test:runtime-e2e`는 실제 클릭과 DB 레코드를 교차 검증합니다.

`npm run test:connection-e2e`는 저장소 밖의 검증용 프로젝트에 실제 tarball을 설치하고 브라우저·기존 API·소스·HMR·production을 검사합니다. 사용자 업무 프로젝트 검증을 대신하지 않습니다.

## leerness

개발 의존성으로 `leerness@1.36.305`를 고정하고 한국어 minimal 하네스를 초기화했습니다. `.leerness/`, `AGENTS.md`, `CLAUDE.md`는 CLI 생성 결과입니다. leerness 원본 저장소는 수정하지 않습니다. 개발 시 해당 지침과 현재 사용자 지시를 확인하세요.

```bash
npm run harness:status
npm run harness:verify
```

## 주의

로컬 전용입니다. 외부 공개·운영 DB 편집·자동 배포는 지원하지 않습니다. 런타임 기록은 메모리 보관이며 best-effort입니다. 수집 누락을 미실행/실패로 단정하지 않습니다. `.env`, symlink, node_modules, 빌드 산출물은 정적 스캔에서 제외합니다. 예시 프로젝트와 실제 분석 결과는 분리됩니다. 원격 응답, fixture, cache, 환경, 내용 진위를 하나의 `real/fake` 플래그로 단정하지 않습니다.
