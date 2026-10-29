---
leernessRole: context-routing
readWhen:
  - 모든 작업 전
  - 작업 유형 판단
updateWhen:
  - 새 작업 유형 추가
  - 참조 파일 변경
doNotStore:
  - 실제 토큰
  - 비밀번호
  - 운영 쿠키
  - 민감한 개인정보 원문
---
<!-- leerness:managed -->
# Context Routing

## 컨텍스트 읽기 정책

- 주 세션 담당자는 시작 시 워크플로·현재 상태·활성 룰을 한 번 적재한다. 후속 메시지나 문맥 압축을 프로젝트 시작으로 다시 취급하지 않는다. 이미 받은 문맥은 재사용하고 바뀌거나 누락된 지침·룰 원본·작업 기록만 다시 확인한다.
- `leerness context current [--task ID]`로 현재 작업과 규칙 원문을, `leerness context budget --files-only`로 이력 본문을 읽지 않고 문서 크기를 확인한다. 명시 읽기 지시·고정 기준·열린 지적·근거는 대체하지 않는다. 마감은 표지가 있는 요약만 갱신하며 표지 없는 과거 원문은 별도 검토한 보관 작업 전까지 유지한다.
- 위임 시 작업 ID·역할·범위·수정 허용 파일·현재 룰 원문과 ID/출처 버전 또는 확인 시점·관련 폐쇄 결정·고정 통과 조건·근거/소스 경로를 전달한다. 룰 개수나 읽었다는 말만으로 대체하지 않는다. 양을 줄이려고 필수 제약을 빼지 않는다.
- 작업자는 전달 내용과 관련 코드/계약부터 읽는다. 검수자는 같은 범위·조건으로 실제 소스·변경분·근거를 독립 확인하며 작업자의 결론을 증거로 간주하지 않는다. 재검수는 기존 지적과 바뀐 근거 및 관련 회귀를 확인한다. 누락·오래됨·모순은 종속 작업 전에 원본을 확인하고 미확인 부분을 보고한다.
- 아래 Leerness 생성 읽기 목록은 색인이다. 현재 파일을 지정해 정확한 작업/룰 ID나 제목을 찾고 필요한 부분만 읽는다. 질문에 필요하지 않은 archive·생성 사본·전체 이력은 제외한다. 출력이 잘리면 파일·검색어·범위를 좁히고 같은 문서를 조각내 전부 다시 출력하지 않는다. 근거·의존성이 있으면 범위를 넓히되 필수 룰 원문은 온전히 유지한다.
- 공유 상태 기록과 세션 마감은 주 담당자가 한 번 수행한다. 위임 에이전트는 담당 작업의 발견·실제 테스트·근거를 반환하고 중복 작업을 등록하거나 부모 작업을 완료 처리하지 않는다. 공유 기록 수정이나 별도 세션 절차는 명시 배정이 있어야 한다. 완료 주장에는 verify-claim과 필요한 실제 검증이 계속 필요하다.
- 검사·테스트 기록은 관련 상태와 범위가 같을 때만 재사용한다. 입력 변경·근거 누락·미해결 실패가 있으면 해당 검증을 수행한다. 긴 검사 로그는 프롬프트 밖에 저장하고 건수·차단 사유·경로를 보고하며 필요한 지적을 확인한다. compact 인수인계는 탐색용이며 활성 룰 원문이나 준수 증거가 아니다. 이 지침은 읽기 안내이며 모델 행동·토큰 절감을 강제하거나 인증하지 않는다.

## planning
Read:
- .leerness/plan.md
- .leerness/progress-tracker.md
- .leerness/project-brief.md
- .leerness/current-state.md
- .leerness/guideline.md

Update:
- .leerness/plan.md
- .leerness/progress-tracker.md
- .leerness/current-state.md
- .leerness/session-handoff.md

## feature
Read:
- .leerness/plan.md
- .leerness/current-state.md
- .leerness/architecture.md
- .leerness/context-map.md
- .leerness/feature-contracts.md
- .leerness/skills/feature-implementation/README.md
- .leerness/reuse-map.md

Update:
- .leerness/progress-tracker.md
- .leerness/feature-contracts.md
- .leerness/current-state.md
- .leerness/task-log.md
- .leerness/session-handoff.md

## consistency
Read:
- .leerness/design-system.md
- .leerness/consistency-policy.md
- .leerness/reuse-map.md
- .leerness/context-map.md

Update:
- .leerness/design-system.md
- .leerness/reuse-map.md
- .leerness/task-log.md
- .leerness/session-handoff.md

## release
Read:
- .leerness/plan.md
- .leerness/release-checklist.md
- .leerness/testing-strategy.md
- .leerness/current-state.md
- .leerness/leerness-maintenance.md

Update:
- .leerness/release-checklist.md
- .leerness/progress-tracker.md
- .leerness/task-log.md
- .leerness/session-handoff.md

## migration
Read:
- .leerness/AX_MIGRATION_GUIDE.md
- .leerness/protected-files.md
- .leerness/context-routing.md
- .leerness/writeback-policy.md

Update:
- .leerness/current-state.md
- .leerness/task-log.md
- .leerness/session-handoff.md

## session-close
Read:
- .leerness/session-close-policy.md
- .leerness/progress-tracker.md
- .leerness/anti-lazy-work-policy.md
- .leerness/plan.md

Update:
- .leerness/session-handoff.md
- .leerness/progress-tracker.md
- .leerness/current-state.md
- .leerness/task-log.md

## session-start
Read:
- .leerness/session-handoff.md
- .leerness/current-state.md
- .leerness/plan.md
- .leerness/progress-tracker.md
- .leerness/decisions.md
- .leerness/task-log.md

Update:
- .leerness/current-state.md

## harness-maintenance
Read:
- .leerness/leerness-maintenance.md
- .leerness/HARNESS_VERSION
- .leerness/protected-files.md

Update:
- .leerness/task-log.md
- .leerness/session-handoff.md

## bugfix
Read:
- .leerness/plan.md
- .leerness/progress-tracker.md
- .leerness/decisions.md
- .leerness/feature-contracts.md
- .leerness/architecture.md

Update:
- .leerness/progress-tracker.md
- .leerness/decisions.md
- .leerness/task-log.md
- .leerness/session-handoff.md

## refactor
Read:
- .leerness/plan.md
- .leerness/architecture.md
- .leerness/reuse-map.md
- .leerness/decisions.md

Update:
- .leerness/architecture.md
- .leerness/reuse-map.md
- .leerness/decisions.md
- .leerness/task-log.md
- .leerness/session-handoff.md

## research
Read:
- .leerness/decisions.md
- .leerness/task-log.md
- .leerness/architecture.md
- .leerness/context-map.md

Update:
- .leerness/decisions.md
- .leerness/task-log.md
- .leerness/current-state.md
