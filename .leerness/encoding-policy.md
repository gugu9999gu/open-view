---
leernessRole: encoding-policy
readWhen:
  - 파일 생성 전
  - 한글 깨짐 보고
  - 배포 전
updateWhen:
  - 인코딩 정책 변경
doNotStore:
  - 실제 토큰
  - 비밀번호
  - 운영 쿠키
  - 민감한 개인정보 원문
---
<!-- leerness:managed -->
# Encoding Policy

## Rules
- Markdown/JSON 하네스 문서는 BOM 없는 UTF-8로 읽고 씁니다. 기존 줄바꿈과 유효한 Unicode를 보존합니다.
- Windows PowerShell 5.1에서 비ASCII 문자가 있는 .ps1은 UTF-8 BOM이 필요할 수 있습니다. 스크립트 내부의 콘솔 설정은 최초 파일 해석을 고치지 못합니다. shebang 파일이나 .bat에 BOM을 일괄 추가하지 않습니다.
- 파일 읽기/쓰기, 외부 프로그램 stdin 전송, stdout 해석은 별도 경계입니다. UTF-8 파일은 `Get-Content -Raw -Encoding UTF8`처럼 인코딩을 명시합니다. `chcp 65001` 또는 콘솔 설정만으로 전 경로가 보장되지는 않습니다.
- 외부 프로그램이 UTF-8을 받는 경우에만 해당 자식 셸의 `$OutputEncoding`을 맞춥니다. 프로필이나 전역 환경을 변경하지 않습니다. Python 파일 입출력도 `encoding='utf-8'`을 명시합니다.
- 가능하면 직접 인자/바이트 입출력을 재사용합니다. 출력 조각마다 따로 문자열로 변환하지 말고, 엄격한 스트리밍 해석과 마지막 flush 또는 제한된 바이트 결합 후 해석을 사용합니다.
- 이미 `?` 등으로 대체된 문자는 인코딩 선언으로 복원되지 않습니다. 확인된 원본/버전을 사용하거나 경로 수정 후 허가된 작업을 다시 실행합니다. 추정 복원을 원본으로 간주하지 않습니다.

## Check limits
`leerness encoding check`는 바이트 형식과 정책 문제, 미검사 범위(coverage), 문장 손상 의심(textIntegrity)을 구분합니다. 큰 파일·읽기 실패·링크·깊이 제한으로 선택 범위를 모두 확인하지 못하면 검사는 불완전합니다. 일부 하네스 문서의 반복 손상 신호는 확정 오류가 아닌 참고 정보이며 자동 복구하지 않습니다. 정상 UTF-8이고 의심 신호가 없어도 문장 의미는 미검증입니다. .ps1 호환성과 유효한 BOM 예외는 별도로 확인합니다.
