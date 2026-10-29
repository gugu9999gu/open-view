---
leernessRole: design-system
readWhen:
  - UI 변경
  - 컴포넌트 추가
  - designguide 병합
updateWhen:
  - 디자인 기준 변경
  - 재사용 패턴 발견
doNotStore:
  - 실제 토큰
  - 비밀번호
  - 운영 쿠키
  - 민감한 개인정보 원문
---
<!-- leerness:managed -->
# Design System

## Canonical File
이 파일은 designguide.md, design-guide.md와 같은 디자인 가이드의 기준 파일입니다.

## Tokens
| Token | Value | Notes |
|---|---|---|
| color.primary | (실제 값으로 업데이트) | |
| color.surface | | |
| spacing.unit | | |
| typography.body | | |

## Reusable Patterns
| Pattern | Where | Reuse Rule |
|---|---|---|

## 정보 표시 품질
UI 영역마다 사용자 질문, 지표의 고유 의미와 데이터 출처, 대상·필터·기간·스냅샷·단위·집계, 추가 가치를 확인합니다. 하나의 사실에 이름만 바꾼 카드를 채우지 않습니다. 숫자 일치만으로 중복 판정하지 않으며 상세·추이·비교·접근성용 표는 다른 질문에 답할 수 있습니다. 출처나 의미가 불명확하면 unknown으로 남깁니다. 삭제 전에 실제 동시 노출 화면을 검토합니다. 읽기 전용 `leerness ui information --stdin --json`은 제공된 메타데이터의 후보를 찾을 뿐 의미·렌더·승인을 검증하지 않습니다.
