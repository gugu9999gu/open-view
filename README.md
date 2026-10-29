# Open View

웹 프로젝트의 **페이지 → 함수 → API → DB** 관계를 눈으로 확인하는 로컬 개발 도구의 설계·프로토타입입니다.

**현재 상태(0.2.0): 정적 분석 + 명시적 Browser/Node 계측 SDK + React/Vite → 로컬 PostgreSQL의 실제 실행 조회. 임의 프로젝트 자동 계측·정확한 소스 매핑은 아직 미구현입니다.**

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

## 실제 실행 예제

전용 로컬 DB를 준비한 후 실행합니다. `.env` 자동 탐색이나 운영 DB 자동 연결은 하지 않습니다.

```bash
# 아래 연결 정보는 예시입니다. 전용 로컬 DB 정보를 명시하세요.
export OPEN_VIEW_EXAMPLE_DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:5432/open_view_example'
npm run example:runtime
```

터미널의 `loginUrl`과 `appUrl`을 열고 저장 버튼을 누른 뒤, Open View의 **실제 실행 → 새로고침**에서 확인합니다. 정상 커밋·롤백·커밋 후 오류·fixture 반환을 별도로 관측합니다. 이 명령은 예제 DB에 실제 레코드를 저장합니다. 일반 `npm start` 정적 분석은 여전히 대상 DB/파일을 변경하지 않습니다.

[DB 준비부터 실행까지](docs/RUNTIME-QUICKSTART.ko.md) · [12개 인수 기준과 진행률](docs/RUNTIME-DEVELOPMENT.ko.md)

## 문서

- [상세 제품 설계](docs/PRODUCT-DESIGN.ko.md)
- [구현 상태와 한계](docs/IMPLEMENTATION-STATUS.md)
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

## leerness

개발 의존성으로 `leerness@1.36.305`를 고정하고 한국어 minimal 하네스를 초기화했습니다. `.leerness/`, `AGENTS.md`, `CLAUDE.md`는 CLI 생성 결과입니다. leerness 원본 저장소는 수정하지 않습니다. 개발 시 해당 지침과 현재 사용자 지시를 확인하세요.

```bash
npm run harness:status
npm run harness:verify
```

## 주의

로컬 전용입니다. 외부 공개·운영 DB 편집·자동 배포는 지원하지 않습니다. 런타임 기록은 메모리 보관이며 best-effort입니다. 수집 누락을 미실행/실패로 단정하지 않습니다. `.env`, symlink, node_modules, 빌드 산출물은 정적 스캔에서 제외합니다. 예시 프로젝트와 실제 분석 결과는 분리됩니다. 원격 응답, fixture, cache, 환경, 내용 진위를 하나의 `real/fake` 플래그로 단정하지 않습니다.
