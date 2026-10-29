# 외부 프로젝트 연결 — O01–O10

상태: **O01–O09 검증 완료, O10 미실행. 9/10 = 90%**. 기존 R01–R12(12/12)와 별도 분모이며 전체 제품/공수 진행률이 아니다.
사용자의 '다음 단계 개발' 지시에 따라 이전에 제안한 명시적 연결·선택적 계측·지원 범위 진단을 진행한다.
기존 UI를 재사용하며 새 화면 리디자인/자동 소스 수정/클라우드 연결은 하지 않는다.

| ID | 고정 인수 기준 | 상태 |
|---|---|---|
| O01 | CLI init 기본 미리보기, --write 신규 JSON만 생성, 기존 파일 덮어쓰기 금지 | 검증 완료 |
| O02 | 엄격한 설정 스키마, 상대 파일 allowlist, 루트 밖·숨김·symlink·과대 파일 거부 | 검증 완료 |
| O03 | doctor는 Vite config·스크립트를 실행하지 않고 .env를 읽지 않으며 설치 버전·선택 파일·callback 진단 | 검증 완료 |
| O04 | 로컬 Vite 연결, UI/agent 권한 분리·포트 충돌·중복 플러그인·종료 정리 | 검증 완료 |
| O05 | npm pack 설치용 CLI/exports, 저장소 밖 독립 소비 프로젝트에서 실행 | 검증 완료 |
| O06 | 외부 React 브라우저 클릭→HTTP→OBSERVED→원본 코드, 비선택 파일은 소스 미확인 | 검증 완료 |
| O07 | 기존 업무 API/오류 의미 보존, 수집기 중단 후 앱 동작 및 호스트/출처 경계 | 검증 완료 |
| O08 | 외부 프로젝트 운영 build에서 계측/소스 manifest/개발 endpoint 제거, noop 동작 | 검증 완료 |
| O09 | 외부 프로젝트 HMR 과거 코드/새 코드 분리, init 생성 파일 및 테스트의 HMR 수정을 제외한 프로젝트 파일 무변경·기존 전체 회귀 | 검증 완료 |
| O10 | 사용자가 지정한 실제 업무 프로젝트 1개에서 연결·핵심 흐름 인수 검증 | 미실행: 대상 미지정 |

O01–O09의 독립 소비 프로젝트는 자동 생성한 검증용 프로젝트다. 사용자 업무 프로젝트 검증으로 계산하지 않는다.
지원 시작 범위: Node 22+, 설치된 Vite 7, React 19, 루프백 HTTP, base=/, 단일 Vite root, 명시적 inline callback.
Next/SSR/모노레포 자동 탐색/별도 Node 서버 자동 연결/모든 함수 자동 계측은 미지원.
프로젝트 설정 파일과 플러그인은 신뢰한 로컬 코드다. doctor/init는 실행하지 않고 dev는 --trust-project가 필요하다.

## 로컬 패키지 설치

공개 npm에 배포하지 않았다. 다른 동명 레지스트리 패키지를 설치하지 말고 이 브랜치에서 만든 tarball을 사용한다.
Open View 저장소에서:

```bash
git fetch origin
git switch feat/project-connection-20261029
npm ci
npm pack --ignore-scripts
```

대상 Vite 프로젝트 폴더에서 다음을 실행한다. 패키지 설치 자체는 npm에 의해 package.json/lockfile을 변경하므로 검토 후 실행한다.
Open View CLI의 init/doctor는 npm 설치나 스크립트 변경을 수행하지 않는다.

```bash
npm install --save-dev /absolute/path/to/open-view/open-view-0.2.0.tgz
npx --no-install open-view init --source src/App.jsx
# 출력된 JSON을 확인한 뒤 신규 설정 파일 생성
npx --no-install open-view init --source src/App.jsx --write
npx --no-install open-view doctor --json
npx --no-install open-view dev --trust-project
```

`src/App.jsx`는 실제 존재하는 파일 경로로 바꾼다. 여러 파일은 `--source`를 반복한다. 이미 설정이 있으면 init은 덮어쓰지 않는다.
설정 수정은 사용자가 JSON을 편집한다. 제거는 개발 서버 종료 후 이 JSON과 직접 추가한 래퍼/의존성을 제거하는 방식이다.
기존 `vite.config.*`와 npm scripts는 그대로다. `dev`는 설치된 대상 프로젝트의 Vite를 불러오며 설정/플러그인을 실행한다.
따라서 임의 다운로드 프로젝트를 신뢰 없이 실행하지 않는다. Vite 자체의 .env 읽기는 원래 앱 동작이며 doctor의 비실행 진단과 다르다.

설정 예시:

```json
{
  "schemaVersion": 1,
  "sourceFiles": ["src/App.jsx"],
  "uiPort": 4418,
  "appPort": 5173
}
```

포트 `0`은 사용 가능한 포트를 자동 선택한다. 시작 후 터미널에 출력된 `loginUrl`과 `appUrl`을 사용한다.
같은 터미널의 `auth`는 일회용 로그인 URL 재발급, `stop-collector`는 관측 서버만 중단한다. 관측 재시작은 dev를 다시 실행한다.
JSON은 비밀값을 담지 않는다. sourceFiles는 1–32개의 명시적 상대 경로이며, 파일당 최대 256 KiB이다.
루트 밖/숨김 파일/의존성·빌드 디렉터리/심볼릭 링크/중복 경로는 거부한다. 신뢰한 개발 프로젝트용이며 악성 로컬 프로세스에 대한 OS 격리 샌드박스는 아니다.

## 명시적 함수 계측

패키지 설치나 sourceFiles 선택만으로 모든 함수가 계측되지는 않는다. 해당 파일에서 다음 형태로 직접 감싼다.
콜백과 라벨은 정적으로 해석 가능해야 한다. 비선택 파일도 래퍼 실행 이벤트는 보고할 수 있지만 원본 매핑은 하지 않는다.

```jsx
import { traceAction } from 'open-view/browser';

async function handleSave() {
  return traceAction('Save customer', async action => {
    return action.span('saveCustomer', async span => {
      const response = await span.fetch('/api/customers', { method: 'POST' });
      if (!response.ok) throw new Error('Save failed');
      return response.json();
    });
  });
}
```

`traceAction('Save', handler)`처럼 콜백 식별자를 넘기는 형태는 실행 이벤트는 나와도 소스 매핑 대상이 아니다.
`doctor`의 supported callback 수는 정적 진단이고 실행 사실이나 전체 함수 커버리지가 아니다.
개발 요청에 traceparent를 붙이는 범위는 같은 origin뿐이다. 승인된 요청의 redirect는 보안상 error 처리하며, 일반 fetch와 이 차이가 있다.
교차 출처 API/별도 Node 서버/DB 내부는 자동 계측하지 않는다. 초기 단계의 Node/PG 명시적 SDK는 별도로 연결해야 한다.

## Vite 플러그인 직접 연결 (CLI 대신)

기존 dev 명령을 유지하려면 사용자가 직접 Vite 설정에 추가할 수 있다. CLI 주입과 동시에 사용하면 중복 오류가 난다.

```js
import { defineConfig } from 'vite';
import { openView } from 'open-view/vite';
export default defineConfig({
  server: { host: '127.0.0.1' },
  plugins: [openView({ sourceFiles: ['src/App.jsx'], uiPort: 4418 })]
});
```

이 직접 플러그인 방식은 신뢰한 Vite 설정을 직접 실행하는 opt-in이다. CLI doctor 사전 진단을 자동 수행하지 않으므로 먼저 별도로 실행한다.
같은 Vite 프로세스의 자체 API 플러그인은 명시적으로 `connector.api.tracer.request(label, traceparent, callback)`를 사용할 수 있다.
이는 임의의 외부 API를 자동 프록시하거나 별도 서버를 자동 패치하지 않는다.

## 운영·실패·보관 범위

공개 `open-view/browser` 패키지의 기본 export는 no-op이다. 연결 플러그인이 개발 시에만 관측 구현으로 해석하며,
일반 `vite build`에서도 콜백 업무 동작은 그대로 실행하고 수집기는 시작하지 않는다. target 앱의 source map 설정은 변경하지 않는다.
CI에서는 source map을 비활성화한 소비 앱의 번들에서 개발 endpoint/참조 표식 부재를 검사한다.
기존 프로젝트의 다른 빌드 플러그인·배포 환경까지 자동 안전성을 보장하는 것은 아니다.

선택 소스의 원본 코드에는 상수/SQL/주석/하드코딩 비밀값이 포함될 수 있다. 자동 비밀값 제거를 보장하지 않는다.
보관된 원본은 UI 인증으로만 조회하며 페이지 relay 토큰으로 읽을 수 없다. TTL/상한/서버 종료 시 삭제한다.
명시적 앱 요청은 실제 업무 동작이다. 이 도구가 자체 DB를 만들지는 않지만 사용자의 버튼을 누르면 원래 앱의 저장이 발생한다.
로컬 개발 DB와 테스트 계정을 사용한다.

검증 버전: Node 22, Vite 7.3.7, React 19.3.1. CLI는 Vite7/React19 major를 허용하지만 모든 minor/플러그인 조합을 검증한 것은 아니다.
Next/SSR/base 하위 경로/HTTPS/middlewareMode/외부 host/중복 alias는 지원하지 않는다.
HMR은 전체 reload이며 React 상태 보존형 HMR/Node hot reload/실시간 자동 UI 갱신은 아직 없다.
Windows/macOS 및 사용자 실제 프로젝트는 아직 검증하지 않았다.

## 검증 재현

```bash
npm test
npm run check
# PostgreSQL와 Chromium이 준비된 검증 환경
npm run test:integration
npm run test:e2e
npm run test:runtime-e2e
npm run test:connection-e2e
```

외부 프로젝트 검사는 /tmp 아래 독립 root, 실제 npm tarball 설치와 npm ci, 기존 Vite API 플러그인, 실제 브라우저를 사용한다.
init/doctor의 비실행, 원본 연결, 미선택 파일, 오류 의미, 출처/권한 경계, 운영 빌드, HMR 과거 코드, 수집 중단 후 앱 작동과 파일 무변경을 확인한다.
패키지 준비에 npm 네트워크가 필요하다. 사용자 업무 프로젝트 O10의 대체 근거가 아니다.

구현 규격 참고: Vite 공식 Plugin API의 config/configResolved/configureServer/transform/closeBundle과 Node 공식 packages exports.
- https://vite.dev/guide/api-plugin
- https://nodejs.org/api/packages.html

## 검증 근거 — 2026-10-29

코드 head `e7e408674a99611e25ea527db7099d2aa2e33e3d`, tree `f4f7bebbaa8f98dc2286ad78cd3b58cb2c4421cd`,
CI run `40853572299`, artifact `12888601606`.
Node/실제 HTTP 97/97, 실제 PostgreSQL 9/9(부모 테스트 포함), 기존 브라우저 14/14,
React/DB/HMR 17/17, 외부 패키지 소비 프로젝트 12/12, 구문·인코딩 49개 모듈이 통과했다.
외부 소비 앱의 2개 production 파일에서 개발 표식 8개와 source map이 없음을 검사했고,
기존 예제의 3개 파일/9개 개발 표식 부재 검사도 통과했다.

최초 코드 CI archive의 121개 파일 전부가 로컬 코드 commit과 동일하다. 화면에서 실제 외부 함수와 과거 코드를 확인했다.
문서 후속 커밋은 별도 head CI로 재검증한다. 해당 최종 결과는 PR #4에 기록한다.
로컬 npm DNS 실패 때문에 로컬 실제 패키지 설치·브라우저 E2E를 통과로 보고하지 않으며,
외부 소비 앱/실제 PostgreSQL/브라우저의 통과 근거는 GitHub Actions다. 모의 browser fetch는 사용하지 않았다.

O01–O04: `test/onboarding.test.mjs`, O05–O09: `scripts/check-connection.py`와 기존 회귀 검사.
O10: 사용자 업무 프로젝트 경로/저장소가 지정되어 있지 않아 실행하지 않았다. 검증용 소비 앱은 O10의 대체물이 아니다.
이 단계의 성공은 지원 범위 안의 명시적 연결이며 임의 프로젝트 무설정 자동 계측이 아니다.
