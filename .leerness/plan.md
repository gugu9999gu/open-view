---
leernessRole: plan
readWhen:
  - 작업 시작 전
  - 새 요청 접수
  - 범위 변경
  - 신규 프로젝트 감지
updateWhen:
  - 계획 추가/수정/드랍
  - milestone 변경
  - 목표 변경
doNotStore:
  - 실제 토큰
  - 비밀번호
  - 운영 쿠키
  - 민감한 개인정보 원문
---
<!-- leerness:managed -->
# Plan

## Goal
- 사용자 목적을 기준으로 전체 계획을 유지합니다.

## Scope
- 포함 범위를 기록합니다.

## Out of Scope / Dropped
| ID | Item | Reason | Date |
|---|---|---|---|

## Milestones

### M-0001. 프로젝트 계획 정리
Status: planned
Progress: 0%

Tasks:
- [ ] project-brief.md를 실제 프로젝트 목적에 맞게 작성
- [ ] context-map.md를 실제 파일 구조에 맞게 작성

### M-0002. 설계 검수 보강
Status: completed
- [x] 재사용 bootstrap/쿠키 경계 재현 후 수정
- [x] 스캔 완전성, worker 격리, 전체 그래프 검색 수정
- [x] 소스/전파/저장 판정 계약과 회귀 테스트 추가
- [x] 로컬 Node/HTTP 44개, 모듈 소스 검사 18개 통과
- [x] 코드 head 6b0ffdf: CI run 40820622011, 실제 브라우저 14개 및 harness 검증 통과
- PR #1 검토 대상이며 main에는 자동 병합하지 않음.

### M-0003. 실제 저장 trace 한 경로
Status: planned
- [ ] React/Vite + Node + 로컬 PostgreSQL의 실제 trace 경로 구현
- [ ] 동시 클릭·rollback·commit 후 오류·수집기 중단 검증
