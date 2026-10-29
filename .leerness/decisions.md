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

## 2026-10-29 — R11/R12
- 함수명/시간 대신 원본 모듈 해시+AST callback 범위를 정적 분석과 공유한다. 미보관/미지원 참조는 현재 소스로 대체하지 않는다.
- 개인정보 최소화와 소스 보기의 충돌을 숨기지 않는다: 이벤트는 메타데이터지만 선택한 원본 코드의 상수·SQL·주석은 보관될 수 있다. 로컬 메모리 상한·TTL·UI 인증·전체 삭제로 제한한다.
- 이번 HMR은 전체 reload 및 버전별 trace 그래프다. React 상태 보존/Node hot reload/모든 함수 자동 계측을 완료로 보고하지 않는다.
