---
leernessRole: reuse-map
readWhen:
  - 새 컴포넌트/API/helper 생성 전
  - 중복 기능 감지
updateWhen:
  - 재사용 가능한 요소 추가
doNotStore:
  - 실제 토큰
  - 비밀번호
  - 운영 쿠키
  - 민감한 개인정보 원문
---
<!-- leerness:managed -->
# Reuse Map

| Capability | Existing Element | Reuse Method | Notes |
|---|---|---|---|
| 외부 프로젝트 설정 | onboarding/config.mjs | initProject/loadConfig/readLocalFile | 배타적 생성·파일 경계·256 KiB 상한 |
| 비실행 진단 | onboarding/doctor.mjs | diagnoseProject | 실행 증거로 승격하지 않음 |
| Vite 연결 | onboarding/vite.mjs | openView | 기존 collector/relay/source-registry 재사용 |
| 명시적 브라우저 API | runtime/browser-client.mjs, browser-disabled.mjs | open-view/browser export | 운영 기본 no-op, 개발에서만 alias |
