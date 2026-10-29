# 구현 상태 — 0.1.1

## 구현된 것

기존 SVG 노드맵, 예시 iframe 조작, 합성 타임라인, DEMO/STATIC 분리, Inspector, 그래프 export를 유지한다. UI는 ES module로 분리되어 Node 서버로 제공한다.

- Bootstrap 1회 교환·5분 만료, 별도의 UI Bearer 세션·8시간 만료, 로그아웃 철회, 터미널 `auth`로 링크 재발급.
- 쿠키 인증 제거, 다른 origin/포트로 UI 자격 증명 전달 금지, CSP nonce·Host·Origin 검사. UI 기본 포트 4418.
- 별도 worker에서 수행하는 실제 TS/JS 정적 분석, 상대 import 함수 호출, JSX 핸들러, 일부 Next-style 라우트, fixture 후보.
- 스캔의 complete/partial 상태와 누락 사유/경로. 파일·크기·깊이·디렉터리·엔트리·탐색 시간·알림 수 상한. worker 종료 기한.
- 내용 기반 정적 sourceSnapshotId와 함수 sourceRef. 실제 runtime build ID와는 구분.
- 전체 그래프 검색과 페이지 이동, 검색한 노드의 이웃 재표시. 캔버스 100개 제한은 검색/export 범위를 제한하지 않음.
- 저장/롤백/업무 결과를 분리하는 순수 판정 함수와 origin allowlist traceparent 보조 함수. 런타임 수집을 수행하는 기능은 아님.
- 읽기 전용 PR 검증: npm ci, 소스 검사, Node/HTTP 테스트, 실제 브라우저 E2E 스크립트, 검증 산출물 업로드. 검증 중 소스 자동 수정·커밋 없음.

## 아직 구현하지 않은 것

임의 웹프로젝트 iframe 연결, 브라우저/서버 SDK, 자동 함수 계측, 런타임 source manifest, source map 역매핑, OpenTelemetry 수집, 실제 DB/호스팅 커넥터, payload 캡처, DOM 데이터 lineage, watcher/HMR, trace 지속 저장, VS Code 이동, MCP, 운영 격리, npm CLI 배포.

## 제한

정적 import 해석은 루트 내 상대 경로 중심이다. tsconfig alias, package exports, dynamic import/call, 전체 타입/데이터 흐름은 지원하지 않는다. complete는 지원 소스 범위에서 제한으로 누락되지 않았다는 뜻이지 앱 전체를 이해했다는 뜻이 아니다.

소스 파일 1,500개·파일당 512KiB·합계 24MiB·깊이 20·디렉터리 3,000개·엔트리 30,000개·탐색 10초·알림 200개, 서버 worker 30초가 기본 상한이다. 벤치마크 보장값이 아니다. 신뢰한 로컬 폴더만 사용한다. 악성 동시 파일 변경을 완전히 격리하지 않는다.

세션 자격 증명은 JavaScript가 읽을 수 있는 sessionStorage/메모리에 있으므로 동일 origin XSS를 완전히 방어하는 수단은 아니다. 쿠키의 포트 간 자동 공유는 제거했지만 악성 로컬 프로세스·확장 프로그램은 별도 위협이다.

## 검증 근거

로컬 Node 22.16.0 + 사전 설치 TypeScript 5.8.3으로 `npm test` 44개 통과, `npm run check` 18개 JavaScript 모듈 검사 통과. 실제 HTTP 인증과 worker 분석을 포함한다. 네트워크 DNS 제한으로 로컬 `npm ci` 및 leerness CLI 검증은 수행하지 못했다. CI에서는 lockfile 설치 후 검사하도록 구성했다.

`python scripts/check-ui.py`는 실제 브라우저가 서버에 접속하며 fetch 대체나 set_content를 사용하지 않는다. 로컬 Chromium에서는 `ERR_BLOCKED_BY_ADMINISTRATOR`로 최초 접속이 차단되어 **로컬 E2E 통과가 아니다**. 결과는 `artifacts/e2e/results.json`, PR CI에서는 `open-view-verification` artifact로 남긴다. 코드 커밋 `6b0ffdf91c30d4542346861b514af82b86e44c94`의 PR CI run `40820622011`에서 npm ci, leerness verify, 44개 Node 테스트와 14개 실제 브라우저 E2E 항목이 통과했다. E2E가 기록한 `82f347321bf97677b4ec96cc9895ab2148c036de`는 GitHub의 임시 PR merge commit이다. 이후 변경은 해당 커밋의 Actions 결과를 별도로 확인해야 한다.

`docs/ui-test-results.json`의 15개 결과는 이전 0.1의 분리 UI/HTTP 검사 기록이며 이번 변경의 브라우저 검증 근거가 아니다. Windows/macOS와 사용자의 실제 프로젝트, 실제 DB는 미검증이다.

## 다음 단계

[검수 보강·구현 계약](HARDENING-AND-CONTRACTS.ko.md)의 한 경로 인수 기준에 따라 React/Vite + Node + 로컬 PostgreSQL의 실제 저장 trace를 구현한다. 소스 탐색과 인증을 보강한 것을 전체 실시간 추적 MVP 완성으로 간주하지 않는다.
