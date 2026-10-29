# 구현 상태 — 0.1

## 구현된 것

- 독립 HTML UI, SVG 노드 맵, 예시 iframe의 입력/저장, 노드 헤더 drag와 배경 pan, zoom/fit.
- 고객/주문/상품 동적 패턴/설정의 예시 페이지 전환.
- 외부 경로 / fixture fallback / API error 합성 시나리오. 실제 네트워크 요청을 발생시키지 않음.
- Inspector, 소스 위치 예시, 마스킹 예시, 출처 표, 합성 타임라인, 검색, JSON export.
- 프로젝트 루트를 지정하는 로컬 Node HTTP 서버. Loopback + capability 인증 + HttpOnly/SameSite 쿠키 + Host/Origin 검사.
- TypeScript AST 기반의 실제 소스 선언/상대 import 함수 호출/JSX 핸들러 연결, 일부 Next-style 파일 라우트 인식.
- mock/fixture 경로와 mock library import 후보 탐지. 확정 판정 아님.
- 실제 분석 모드와 DEMO 데이터 분리. export 시 루트 절대 경로 치환.
- leerness 고정 개발 의존성과 CLI로 생성한 minimal 한국어 하네스.

## 아직 구현하지 않은 것

임의 웹프로젝트 iframe 연결, 브라우저/서버 runtime SDK, 자동 함수 계측, source map 역매핑, OpenTelemetry 수집, 실제 DB/호스팅 커넥터, request/response body 캡처, 정확한 DOM 데이터 lineage, 파일 watcher/HMR, trace 지속 저장/조회, VS Code 이동, MCP, 운영 안전 격리, npm CLI 배포.

## 정적 분석의 제한

루트 내 상대 import만 해석합니다. tsconfig path aliases, package export 조건, dynamic import/call, 전체 TS type/data-flow, framework-specific routing semantics를 완전 해석하지 않습니다. 함수가 연결되었다고 실제 실행되었다는 뜻은 아닙니다. SDK import가 DB 연결 성공을 뜻하지 않습니다.

파일 1,500개, 파일당 512KB, 합계 24MB, 깊이 20을 상한으로 사용합니다. 상한에 도달하면 `coverage.truncated`가 표시됩니다. UI에는 최대 100개 노드를 그립니다. graph export는 서버가 반환한 전체 제한 내 분석 결과를 담습니다. 이 값들은 성능 benchmark가 아닙니다.

로컬의 신뢰한 프로젝트를 대상으로 합니다. 같은 사용자 권한으로 파일을 경합 변경하는 악성 프로세스에 대한 완전한 격리가 아닙니다. 공개 서버로 배포하지 마세요.

## 검증

`npm test`: Node 테스트 6개.
`python scripts/check-ui.py`: UI/HTTP 검사 15개. API 인증, Host/Origin 방어, 임의 파일 비노출, iframe 클릭 시연, fixture/오류 표시, 실제 AST 결과 렌더링, 모드 분리, 라우트 전환, 검색, zoom, export, JS 예외 검사.

브라우저 navigation이 제한된 실행 환경이므로 UI는 `set_content`로 로드하고 실제 서버의 AST JSON을 테스트 transport로 전달했습니다. HTTP는 urllib로 별도 테스트했습니다. **전체 브라우저→서버 E2E가 아닙니다.** Linux에서만 실행했습니다. Windows/macOS와 사용자 실제 프로젝트는 미검증입니다.

## 다음 작업의 경계

첫 목표는 React/Vite + Node 예제 한 개에서 실제 클릭 → client handler → API → server function → 저장소 client 경계를 연결하는 것입니다. DB 내부 추적과 임의 JS 데이터 흐름 전체를 동시에 구현하지 않습니다. 사용자 검토 전에는 현재 UI 시안을 정식 제품으로 완료 처리하지 않습니다.
