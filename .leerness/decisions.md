---
leernessRole: decisions
readWhen:
  - 설계 결정 확인
updateWhen:
  - 중요 결정 발생
doNotStore:
  - 실제 토큰
  - 비밀번호
  - 운영 쿠키
  - 민감한 개인정보 원문
---
<!-- leerness:managed -->
# Decisions

## Template (예시 — 실제 결정은 아래 코드블록 밖에 추가)

```md
### 2026-10-29 — Decision 제목
- Decision:
- Reason:
- Alternatives:
- Impact:
```

### 2026-10-29 — 검수 보강의 권한·관측 경계
- Decision: Bootstrap과 UI 세션 분리, 쿠키 대신 명시적 same-origin Authorization. Runtime ingest 자격 증명은 향후 별도 도입.
- Reason: 쿠키는 포트 격리 수단이 아니며 실제 실행/저장을 정적 근거로 확정하면 안 됨.
- Alternatives: 전용 호스트 쿠키 방식은 추가 로컬 호스트 설정이 필요하므로 이번 단계에서 선택하지 않음.
- Impact: UI는 서버 제공 ES module이고 file:// 실행을 지원하지 않음. Graph schemaVersion 2. Runtime agent는 아직 없음.
