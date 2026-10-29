# 실제 실행 예제 시작하기

이 예제는 명시적 계측 래퍼가 연결된 React/Vite → Node → PostgreSQL 경로다. 임의 프로젝트 자동 계측이나 운영 배포 도구가 아니다.

## 1. 의존성

Node 22 이상, Python 3.12(브라우저 테스트 시), 별도 로컬 PostgreSQL이 필요하다.

```bash
git fetch origin
git switch feat/source-mapping-20261029
npm ci
```

## 2. 전용 예제 DB

기존 로컬 PostgreSQL의 `open_view_example` DB를 사용하거나 다음 Docker 컨테이너를 생성한다. 이름이 같은 컨테이너/포트가 이미 있으면 먼저 충돌을 확인한다. 다른 컨테이너나 DB를 자동 삭제하지 않는다.

```bash
docker run --name open-view-example-db \
  -e POSTGRES_USER=open_view_example \
  -e POSTGRES_PASSWORD=open_view_local_only \
  -e POSTGRES_DB=open_view_example \
  -p 127.0.0.1:5432:5432 -d postgres:16
```

위 비밀번호는 로컬 예제 전용 공개 값이며 운영에 사용하지 않는다. 준비가 끝난 후 실행한다.

```bash
export OPEN_VIEW_EXAMPLE_PASSWORD='open_view_local_only'
export OPEN_VIEW_EXAMPLE_DATABASE_URL="postgres://open_view_example:${OPEN_VIEW_EXAMPLE_PASSWORD}@127.0.0.1:5432/open_view_example"
npm run example:runtime
```

PowerShell에서는 `export` 대신 `$env:OPEN_VIEW_EXAMPLE_DATABASE_URL='...'`를 사용한다. 현재 자동 검증 운영체제는 Linux이며 Windows/macOS는 미검증이다.

서버가 출력하는 `loginUrl` 전체 주소로 Open View에 접속하고 `appUrl`로 React 예제를 연다. 기본 포트는 각각 4418, 5173이다. `OPEN_VIEW_UI_PORT`와 `OPEN_VIEW_APP_PORT`로 변경할 수 있다.

대상은 loopback의 `open_view_example` 또는 `open_view_test*` 이름 DB로 제한한다. 예제는 `open_view_runtime_examples` 테이블을 생성하고 입력한 예제 이름을 실제 저장한다. 운영 데이터가 없는 전용 DB만 지정한다.

## 3. 실행과 확인

예제에서 저장을 누른 뒤 Open View의 **실제 실행 → 새로고침 → Save customer**를 선택한다.

| 시나리오 | DB 결과 | 화면에서 구분할 사실 |
|---|---|---|
| 정상 커밋 | 레코드 존재 | transaction committed |
| INSERT 후 롤백 | 레코드 없음 | 쿼리 성공과 rolled-back 구분 |
| 커밋 후 후속 오류 | 레코드 존재 | committed + 업무 실패 |
| 롤백 후 fixture 반환 | 레코드 없음 | rolled-back + fixture 출처 |

저장을 연속 클릭하거나 두 탭에서 실행하면 별도 trace/page ID가 생성된다. 독립 polling 요청은 저장 trace에 붙지 않는다.

실행 중인 터미널에 `stop-collector`를 입력하면 수집기만 중단된다. 예제 앱의 저장은 계속 동작해야 한다. 복구하려면 프로세스를 종료하고 다시 실행한다. 기록은 메모리 보관이며 프로세스 종료 또는 UI의 보관 기록 삭제 시 사라진다.

## 4. 원본 코드와 HMR 확인

실제 실행 상세의 **실행 소스 그래프**에서 `handleSaveCustomer` 또는 `createCustomer` 노드를 선택한다. 원본 상대 경로·줄 번호·파일 버전 해시·callback 코드가 나타난다. 미매핑 HTTP/DB span은 아래 표에 계속 남고 함수명으로 추측 연결하지 않는다.

`examples/runtime-app/src/main.jsx`의 handler 내부 코드를 바꾸면 Vite가 페이지 전체를 다시 로드한다. 새 저장을 실행하고 Open View에서 새로고침한 뒤, 이전 trace와 새 trace를 각각 선택해 다른 버전의 코드를 확인한다. 예제 입력 상태는 reload 때 초기화된다. Node의 `service.mjs`는 자동 재시작하지 않으며 새 코드 실행에는 프로세스 재시작이 필요하다.

과거 원본은 30분/128버전/8 MiB 범위에서만 보관한다. 만료나 삭제 후에는 현재 파일로 대체하지 않고 미확인으로 표시한다. 삭제는 trace와 소스를 모두 지우므로 현재 로드된 코드의 연결도 재컴파일/재시작 전까지 사라질 수 있다.

이벤트에 요청 본문이나 SQL 파라미터를 기록하지 않아도, **선택한 원본 코드에 하드코딩된 상수·SQL·주석은 소스 보관에 포함될 수 있다.** 화면이나 소스를 공유하기 전에 확인한다. 자세한 범위는 [소스 연결 계약](SOURCE-MAPPING.ko.md)을 따른다.

## 5. 검증

```bash
npm test
npm run test:integration
npm run build:example
node scripts/check-production.mjs
python -m pip install -r scripts/requirements-test.txt
python -m playwright install chromium
npm run test:e2e
npm run test:runtime-e2e
```

통합 검사는 실제 PostgreSQL 연결이 없으면 실패한다. 브라우저 검사는 통신을 모의 응답으로 대체하지 않는다. 테스트는 해당 실행의 고유 접두사 레코드만 정리하며 기존 테이블 전체를 비우지 않는다.

## 아직 지원하지 않는 범위

현재 SDK는 명시적인 래퍼다. 선택한 inline callback 밖의 자동 함수 계측, 임의 프로젝트 자동 설치, 클라우드 DB 커넥터, 영구 저장은 미구현이다. 소스 그래프는 trace별 확인된 정의만 보여주며 전체 프로젝트 맵의 라이브 스트리밍은 아니다. 실행 조회는 수동 새로고침이다.

span 종료 이벤트만 수집하므로 비정상 종료 직전의 손실을 완전히 탐지할 수 없다. OBSERVED는 신뢰한 개발용 Agent의 보고이지 위변조 방지 증명이 아니며, 완전성은 항상 best-effort다. 이름·본문·SQL·파라미터·결과 행·오류 원문은 이벤트에 포함하지 않지만 개발자가 직접 붙이는 span 이름에는 개인정보를 넣지 않아야 한다.
