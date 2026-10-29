# 실행 소스 매핑과 HMR 이력 — R11/R12

## 지원하는 경로

선택한 React/Vite 파일의 명시적 `traceAction`과 중첩 `span`, 선택한 Node 예제 모듈의 `tracer.span`에 연결된 **inline callback**을 원본 AST 위치로 식별한다. 함수명이나 이벤트 시간을 근거로 정적 함수에 추정 연결하지 않는다. 기존 호출에 소스 참조를 추가할 뿐, 모든 함수를 자동으로 계측하지 않는다.

예제의 선택 파일은 `examples/runtime-app/src/main.jsx`와 `service.mjs`다. 일반 `npm start`는 대상 코드를 실행하지 않는 정적 분석이며, runtime 예제만 선택된 신뢰 코드의 실행과 소스 보관을 활성화한다.

## 식별 계약

- `projectId`: 정적 분석에서 사용하는 정규 프로젝트 루트 기반 식별자. collector 프로젝트 scope는 별도로 검증한다.
- `moduleId`: 프로젝트 내부의 정규 상대 경로. 외부 경로, 숨김 경로, node_modules/dist/build, 지원하지 않는 확장자는 거부한다.
- `moduleVersion`: 변환하기 전 파일 내용의 SHA-256.
- `definitionId`: project/module/version 및 callback 시작·끝 위치를 묶은 해시. 정적 scanner와 runtime transform이 동일 함수를 사용한다.
- `manifestId`: 해당 파일 버전 manifest의 해시. 이벤트에는 manifest/definition ID 두 값만 추가한다.
- `buildId`: 해당 manifest를 등록한 실행 빌드. source registry가 project/build/definition을 모두 확인한 경우만 `linked`다.

`sourceSnapshotId`는 전체 정적 스캔의 해시로 유지한다. 관계없는 다른 파일이 바뀌어도 해당 모듈의 definition ID는 바뀌지 않는다. 해당 모듈 내용이 바뀌면 새로운 버전이다. 기존 schemaVersion 2의 sourceRef에 moduleVersion을 추가하며 definition ID 산출 규격도 파일 버전 기반으로 변경한다. 영구 저장된 이전 형식의 ID 마이그레이션은 제공하지 않는다.

TypeScript의 lexical symbol을 사용해 import alias와 shadowing을 구분한다. Browser 측은 `@open-view/runtime`의 `traceAction` binding과 그 callback 인자의 span만 지원한다. Node 측은 명시적으로 선택한 receiver parameter를 사용한다. 간접 callback, 동적 label, spread/computed 옵션 등 지원 범위 밖의 형태는 임의로 해석하지 않는다. 현재 inline callback 함수 전체의 원본 위치를 연결하며 DOM 버튼의 소스 위치를 별도로 자동 발견하지 않는다.

## 소스 보관과 안전 경계

이벤트 본문은 여전히 메타데이터 전용이다. **소스 보관은 별도 기능이며 선택된 원본 코드의 상수·SQL 문자열·주석도 포함할 수 있다. 비밀값 자동 제거를 보장하지 않는다.** `.env`를 읽지 않는다는 사실이 소스 내 하드코딩된 값의 안전성을 보장하지 않는다.

원본은 로컬 메모리에서만 보관하고 UI Bearer 인증을 거친 `/api/sources/<manifestId>/<definitionId>`에서 callback 범위만 반환한다. Agent ingest 및 페이지 relay 자격 증명에는 조회 권한이 없다. 임의 파일 경로를 받는 API가 아니며 응답은 `no-store`다. UI는 코드와 파일명을 HTML로 실행하지 않고 textContent로 표시한다.

| 제한 | 기본값 |
|---|---:|
| 보관 버전 | 128 |
| 원본·메타데이터 크기 예산 | 8 MiB |
| 선택 파일 크기 | 256 KiB |
| 파일당 정의 수 | 1,000 |
| 버전당 build 연결 수 | 128 |
| 보관 시간 | 최초 보관부터 30분 |

읽는다고 TTL을 늘리지 않는다. 초과 시 오래된 버전을 제거한다. 만료/삭제된 버전은 `not-retained`로 표시하고 현재 디스크 파일로 대체하지 않는다. 삭제와 서버 종료 시 trace와 소스를 함께 폐기한다. 삭제 후 이미 로드된 모듈의 참조는 재컴파일/재시작 전까지 미확인일 수 있다. 구조적으로 유효한 참조도 신뢰한 Agent의 보고이며 실행 사실을 암호학적으로 증명하는 것은 아니다.

## HMR과 Node 모듈의 차이

Vite 소스 변경은 새 build ID, transform cache 무효화, 전체 페이지 reload로 처리한다. 이전 페이지의 미완료 이벤트가 도착할 수 있으므로 이전 grant와 manifest를 즉시 폐기하지 않고 TTL/상한 안에서 유지한다. 과거 trace 선택 시 보관된 당시 callback bytes를 읽는다. React 입력 상태를 보존하는 Fast Refresh는 아니다.

Node 예제 모듈은 시작 시 한 번 읽은 원본을 변환·실행한다. 이후 디스크의 Node 파일이 바뀌어도 실행 중인 이전 함수는 이전 버전에 계속 대응한다. Node hot reload는 미구현이다. 개발용 loader는 상대/`node:` 정적 import만 지원하고 symlink, bare package import, 동적 import, import.meta는 거부한다. 임의 ESM loader를 대체하지 않는다.

## 실행 그래프

실제 실행 상세에 **trace별 버전 고정 그래프**를 표시한다. 검증된 소스 정의만 노드로 만들고 실행 횟수·오류 수와 함께 강조한다. 노드 선택 시 원본 파일/줄/해시/코드를 보여준다. 최신 STATIC 그래프나 DEMO 그래프에 과거 이벤트를 억지로 덧붙이지 않는다.

간선은 실제 span의 부모 관계를 따라 연결한다. 매핑이 없는 HTTP/DB span을 건너뛴 경우 중간 span 수를 기록한다. 따라서 간선은 직접 함수 호출의 확정 증거가 아니다. 한 trace에서 최대 100개 노드를 렌더링하고 부모 탐색은 128단계로 제한하며 상한 도달을 표시한다. HTTP·DB 내부 span은 관측되어도 소스가 미연결일 수 있다. 자동 스트리밍이나 메인 전체 프로젝트 맵의 실시간 애니메이션은 아니다.

## 검증 근거

[검증 JSON](validation-source-mapping.json): 코드 `256d6db8`, CI run `40845242282`.

- Node/HTTP 82개: scanner/transform ID 일치, shadowing, 중복 이름, 권한, 경로, 원본 유지, 보관 상한·만료·삭제 및 loader 제한.
- 실제 PostgreSQL 9개(부모 테스트 포함), 기존 브라우저 14개, runtime 브라우저 17개.
- 실제 Vite 파일 수정 → 새 build/manifest/definition → 새 저장 → 과거/현재 trace의 코드 교차 확인. 독립 DB 조회로 저장도 대조한다.
- production build 3개 파일에서 9개 개발 표식 및 source map 부재.

코드 변경 이후에는 해당 최종 head CI를 다시 확인한다. 로컬 Chromium은 관리자 정책으로 차단됐으며 CI의 실제 네트워크 결과를 근거로 한다. Windows/macOS 및 사용자 임의 프로젝트는 아직 검증하지 않았다.
