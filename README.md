# Open View

웹 프로젝트의 **페이지 → 함수 → API → DB** 관계를 눈으로 확인하는 로컬 개발 도구의 설계·프로토타입입니다.

**현재 상태: 조작형 UI 시안 + 제한된 TypeScript/JavaScript 정적 분석. 임의 프로젝트의 실시간 실행 추적은 아직 구현되지 않았습니다.**

## 실행

Node.js 22 이상이 필요합니다.

```bash
npm install
npm start
```

터미널에 표시된 `http://127.0.0.1:4317/#token=...` 전체 URL을 여세요. 인증 뒤 주소에서 토큰이 제거됩니다. 초기 화면은 **DEMO**입니다. 예시 페이지 안의 저장 버튼, 시나리오 선택, 노드/간선 선택, 검색, zoom/pan, 데이터 출처 화면을 사용할 수 있습니다. 합성 트레이스는 실제 API를 호출하지 않습니다.

```bash
npm start -- --project "/absolute/path/to/project" --port 4317
```

**폴더 분석**을 누르면 지정한 폴더의 실제 JS/TS 선언, 상대 import 기반 함수 호출, JSX 이벤트 핸들러, 제한된 파일 라우트를 읽습니다. SDK import는 실제 DB 연결의 증거가 아닙니다. 대상 파일을 수정하거나 실행하지 않습니다.

`public/index.html`은 외부 리소스 없는 독립 시안입니다. 브라우저에서 파일을 열어 시연할 수 있지만, 실제 폴더 분석에는 위 서버가 필요합니다. 브라우저 정책에 따라 파일 열기가 제한되면 서버 모드를 사용하세요.

## 문서

- [상세 제품 설계](docs/PRODUCT-DESIGN.ko.md)
- [구현 상태와 한계](docs/IMPLEMENTATION-STATUS.md)
- [UI/HTTP 검증 결과](docs/ui-test-results.json)

## 테스트

```bash
npm test
# 선택: Python playwright 및 Chromium이 설치된 환경
python scripts/check-ui.py
```

UI 테스트는 브라우저 렌더링과 HTTP API를 분리 검사합니다. 전체 browser-network E2E 완료로 해석하지 마세요. 검사 범위/제한은 결과 JSON에 남깁니다.

## leerness

개발 의존성으로 `leerness@1.36.305`를 고정하고 한국어 minimal 하네스를 초기화했습니다. `.leerness/`, `AGENTS.md`, `CLAUDE.md`는 CLI 생성 결과입니다. leerness 원본 저장소는 수정하지 않습니다. 개발 시 해당 지침과 현재 사용자 지시를 확인하세요.

```bash
npm run harness:status
npm run harness:verify
```

## 주의

로컬 전용입니다. 외부 공개·운영 DB 편집·자동 배포는 지원하지 않습니다. `.env`, symlink, node_modules, 빌드 산출물은 정적 스캔에서 제외합니다. 예시 프로젝트와 실제 분석 결과는 분리됩니다. 원격 응답, fixture, cache, 환경, 내용 진위를 하나의 `real/fake` 플래그로 단정하지 않습니다.
