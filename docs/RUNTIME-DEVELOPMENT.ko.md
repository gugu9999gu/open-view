# 실제 저장 경로 개발 — 0.2.0

## 인수 기준 (동일 가중치, 테스트 통과만 완료 처리)

| ID | 기준 | 상태 |
|---|---|---|
| R01 | 제한된 collector: 스키마·중복·순서 역전·보관 상한 | 진행 |
| R02 | UI 조회와 agent 쓰기 권한·프로젝트/실행 인스턴스 분리 | 진행 |
| R03 | 명시적 browser traceAction/function/fetch, 동시 작업 context 분리 | 진행 |
| R04 | Node AsyncLocalStorage 및 HTTP traceparent 연결 | 진행 |
| R05 | 같은 PG client의 쿼리·COMMIT/ROLLBACK/미확인 판정 | 진행 |
| R06 | React/Vite 실제 클릭 → Node → PostgreSQL → OBSERVED 조회 | 진행 |
| R07 | rollback·commit 이후 오류·fixture와 실제 DB 레코드 교차 확인 | 진행 |
| R08 | 동시 클릭·서로 다른 탭·polling trace 분리 | 진행 |
| R09 | 수집기 중단·queue drop·취소·redirect에서 결과/오류 보존 | 진행 |
| R10 | production build에 agent/수집 경로/토큰 미포함 | 진행 |
| R11 | runtime build manifest와 정적 sourceRef의 정확한 연결 | 미구현 |
| R12 | HMR 전후 과거 소스 보존 및 그래프 노드 실행 강조 | 미구현 |

진행률은 R01–R12에서 검증 완료 항목 수 / 12다. 모든 프레임워크·클라우드 지원의 완성률은 아니다.

## 구현 계약

- 메모리 보관만 지원하며 종료/삭제 시 폐기한다. 이벤트는 추가 전용, UI 조회·전체 삭제 지원. 임의 편집은 관측 근거를 변조하므로 제공하지 않는다.
- collector는 기본 비활성. runtime 예제 실행에서만 명시적으로 연결한다. UI 세션과 agent write token은 교환/재사용 불가.
- 브라우저는 Vite 동일 출처 relay만 호출한다. relay는 페이지별 별도 세션을 발급하고 server-side ingest token을 보관한다.
- 모든 이름은 개발자가 지정하는 정적 instrumentation label. 요청 body, headers, SQL text/params/results, 원시 error message/stack은 수집하지 않는다.
- span 종료 이벤트만 수집한다. 프로세스 비정상 종료/네트워크 최종 손실을 완전 탐지할 수 없으므로 항상 best-effort로 표기한다.
- 쿼리 성공/HTTP 200은 커밋의 증거가 아니다. COMMIT acknowledgement 실패는 unknown. 후속 실패가 이미 확인된 커밋을 덮어쓰지 않는다.
- browser async context는 명시적으로 전달하며 전역 fetch를 수정하지 않는다. 전파 allowlist 밖의 요청은 변경하지 않는다. trace wrapper의 redirect=error 정책은 명시적 선택이다.
- 예제는 명시적으로 지정한 loopback 전용 테스트 DB만 사용한다. 운영 DB/클라우드는 연결하지 않는다.
- CI는 읽기 전용, 실제 PostgreSQL service와 Chromium을 사용한다. local 환경 제한과 CI 검증을 구분한다.
