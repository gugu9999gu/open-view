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
Status: completed
Progress: 100% (고정 R01–R12 12개 검증, 전체 제품/공수 비율 아님)
- [x] React/Vite + Node + 로컬 PostgreSQL 실제 trace와 OBSERVED UI
- [x] 동시 클릭·여러 탭·polling·rollback·commit 후 오류·수집기 중단 검증
- [x] Agent/UI 권한 분리, 실제 redirect/abort, production build 계측 제외
- [x] R11 선택된 inline callback의 runtime manifest와 정적 sourceRef 연결
- [x] R12 전체 reload 방식 HMR 과거 소스 보존 및 trace별 그래프 실행 강조
- 증거: code 10e0a0c3, CI 40834192100; 후속 수정은 새 head CI 별도 확인.

### M-0004. 사용자 프로젝트 연결과 지원 범위 확장
Status: planned
- 실제 사용자 프로젝트 한 개에 명시적 설치/설정과 지원 범위 진단을 적용한다.
- 선택적 자동 계측·원본/변환 sourcemap·실시간 갱신은 별도 인수 기준으로 정의한다.
- Supabase/Firestore/Redis/호스팅 커넥터와 영구 저장은 이후 범위다.
- 이 계획은 아직 구현·검증되지 않았으며 기존 R01–R12 진행률 분모를 변경하지 않는다.

R11/R12 근거: code 256d6db8, CI 40845242282, docs/validation-source-mapping.json.
