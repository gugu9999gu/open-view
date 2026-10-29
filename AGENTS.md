<!-- leerness:managed -->
# Leerness Agent Instructions

## 컨텍스트 읽기 범위

아래 세션 시작·작업 등록·공유 기록·마감은 주 세션 담당자의 책임이다. 위임 작업자·검수자는 배정된 작업과 현재 규칙을 재사용하고 전체 시작 절차나 부모 세션 마감을 반복하지 않는다. 누락·오래된 제약은 작업 전에 확인한다. 파일 목록은 관련 부분을 찾는 색인이며 전부 정독하라는 뜻이 아니다. 세부 기준은 .leerness/context-routing.md 앞부분에 있고 최소 모드는 이 문단을 직접 따른다. 사용자·프로젝트 제약은 유지한다. 완료 주장에는 verify-claim과 실제 근거가 필요하다.

## 매 세션 첫 행동
주 세션 담당자는 .leerness/session-workflow.md부터 시작하고 위임 에이전트는 위 읽기 범위를 따른다.

## 정적 vs 동적 — leerness 역할 경계
**AGENTS.md = 정적 프로젝트 지침** (코딩 규칙·테스트 명령·금지 사항·배포 절차 — 자주 안 변함).
**leerness = 동적 작업 상태·기억·검증·인수인계** (현재 목표·수정 파일·실패 시도·검증 결과·다음 에이전트 인계 — 매 작업 변함).
- 규칙/명령/금지는 여기 AGENTS.md 에 적는다.
- 동적 상태(결정/교훈/계획/진행/검증/인수인계)는 leerness 가 **기본 워크스페이스 `.leerness/`** 에 기록한다 (decisions.md / lessons.md / plan.md / progress-tracker.md / session-handoff.md). 기본 `leerness handoff`는 이를 읽고 ignored 세션 runtime record만 갱신하며, 추적 상태 갱신은 `decision add` · `lesson save` · `session close` 같은 명시 쓰기 명령 또는 `handoff --writeback`이 수행한다.
- (선택) `leerness state show|start|record|verify|handoff` (또는 MCP `leerness_state_*`) 의 JSON 상태 substrate 는 `.leerness/` (에이전트 간 인수인계 표준 — state 명령 사용 시 생성). 메인 워크스페이스(.leerness)와 별개.
- leerness 는 AGENTS.md 를 **대체하지 않고 보완**한다. 정적 지침은 여기, 동적 상태는 leerness.

## Context index (session owner; relevant sections)
1. **.leerness/session-workflow.md** (6단계 워크플로 — 최우선)
2. .leerness/context-routing.md
3. .leerness/session-handoff.md
4. .leerness/current-state.md
5. .leerness/plan.md
6. .leerness/progress-tracker.md
7. .leerness/guideline.md
8. .leerness/protected-files.md
9. .leerness/writeback-policy.md
10. .leerness/anti-lazy-work-policy.md
11. **.leerness/rules.md** (사용자 정의 영구 룰 — 매 세션 반드시 따름)

## Required behavior
- 하네스 제목·목록·보고는 간결한 일반 텍스트로 작성하고 장식용 이모지를 추가하지 않습니다. 의미 있는 기호, 사용자 원문, 인용, 식별자와 검사 데이터는 보존합니다.
- 주 세션 담당자는 세션 시작 시 `leerness handoff .`로 컨텍스트를 적재합니다 (handoff가 active rules를 자동 출력).
- **모호성 질문 의무**: 사용자 요청에 판단이 갈리는 부분(모호한 수식어/지시대명사/복수 선택지/불명확한 범위)이 있으면 **추측으로 구현하지 말고 먼저 사용자에게 질문**합니다. `leerness clarify "<요청>"` 이 감지한 질문 목록을 그대로 사용자에게 물어보세요. 신호가 없어도 스스로 판단이 갈리면 질문이 우선입니다.
- **미리보기 승인 의무 (신규 기능)**: 사용자가 신규 기능 추가/구현을 요청하면 **코드를 먼저 작성하지 않습니다**. ① `leerness preview add "<기능>" --design "<디자인/UX 설명>" --features "<기능 목록>"` 으로 미리보기를 등록하고 ② 그 내용을 사용자에게 제시해 승인 또는 수정사항을 질문으로 받습니다. ③ 사용자가 승인하면 `leerness preview approve <P-ID>`, 수정 요구면 `leerness preview revise <P-ID> --note "..."` 후 미리보기를 고쳐 다시 제시합니다. **approve 전에는 해당 기능의 코드를 작성하지 않습니다.**
- **디자인 시안 의무 (웹페이지/디자인 작업)**: 신규 페이지 제작·디자인/리디자인 요청이면 텍스트 설명만으로 끝내지 않습니다. `leerness preview mockup <P-ID>` 로 자립형 HTML 시안 스캐폴드(`.leerness/previews/<P-ID>-mockup.html`)를 만들고, **placeholder 영역을 실제 레이아웃 초안(HTML/CSS, 외부 리소스 없이)으로 교체**한 뒤 사용자에게 브라우저로 열어 보여주고 수정/승인을 질문으로 받습니다. 수정 요구가 오면 시안 파일을 고쳐 다시 제시하고, **approve 전에는 실제 페이지/기능 코드를 작성하지 않습니다.** (이미 만든 시안이 있으면 `preview add ... --mockup <파일>` 로 첨부)
- **데이터 기능 CRUD 기본값**: 저장·관리되는 데이터(엔티티)를 다루는 기능을 만들거나 고칠 때, 엔티티마다 생성·조회(목록/상세)·수정·삭제 중 필요한 조작을 먼저 정하고, 필요한 조작은 저장소→API→화면→권한·검증→테스트까지 끝까지 구현합니다. 빼는 조작은 이유(예: 감사 로그는 추가 전용)를 작업 evidence 에 적습니다. 점검 질문: `leerness lens crud`.
- 작업 분류는 `leerness route <task-type>`로 확인합니다 (planning, feature, bugfix, refactor, research, consistency, release, migration, session-start, session-close, harness-maintenance).
- 보호 파일/관리 섹션을 삭제하지 않습니다. 머지·아카이브·deprecated 표시를 사용합니다.
- 주 세션 담당자는 의미 있는 변경 후 progress-tracker, current-state, task-log, session-handoff를 갱신합니다.
- 완료 선언 전 `leerness check .` 또는 `leerness lazy detect .`로 자기검증하고, `leerness lens`의 분야별 자기질문에 답합니다 (코드: "선임 개발자가 복잡하다고 느끼지 않을까?" / 디자인: "선임 디자이너와 일반 사용자가 이쁘고 직관적이라 느낄까?").
- 변경 전 secret/encoding 가드: `leerness scan secrets .`, `leerness encoding check .`.
- 같은 기능 중복 생성 전 design-system.md, consistency-policy.md, reuse-map.md를 확인합니다.
- 주 세션 담당자는 세션 종료 시 `leerness session close .`로 9개 카테고리(완료/진행중/미완료/예정/대기/보류/차단/드랍/검증) + **활성 룰 검증 결과**를 보고합니다.
- 업데이트는 `leerness update --check` (감지) → `leerness update --yes` (자동 마이그레이션).

## 자연어 회고/통찰/브레인스토밍
사용자가 자연어로 회고/통찰/브레인스토밍을 요청하면 즉시 leerness 명령으로 호출합니다.

| 사용자 발화 (자연어) | 즉시 실행할 명령 |
|---|---|
| "회고해줘 / 돌아보자 / 정리해줘" | `leerness retro` |
| "최근 N일 회고" | `leerness retro --days N` |
| "통계 / 누적 지표 / insights" | `leerness insights` |
| "X에 대해 브레인스토밍 / X 관련 자료 / X 시작 전 검토" | `leerness brainstorm "X"` |

session close가 매번 자동으로 한 줄 요약을 출력하고, 5세션마다 자동 깊은 회고를 실행합니다. 사용자가 명시 요청 시 즉시 호출.

## 자연어 룰 처리
사용자가 자연어로 영구 룰을 요청하면 즉시 leerness rule 명령으로 등록합니다.

| 사용자 발화 (자연어) | 즉시 실행할 명령 |
|---|---|
| "매 업데이트마다 버전 bump해줘" | `leerness rule add "버전을 patch로 bump" --trigger every-update` |
| "매 커밋마다 패치노트 추가해줘" | `leerness rule add "패치노트 추가" --trigger every-commit` |
| "세션 종료마다 배포해줘" | `leerness rule add "배포 (release publish)" --trigger session-close` |
| "X 룰 중지/그만/끄기" | `leerness rule pause <ID>` (해당 룰 ID는 list로 확인) |
| "X 룰 제거/삭제" | `leerness rule remove <ID>` |
| "모든 룰 중지" | `leerness rule stop` |
| "룰 다시 켜줘" | `leerness rule resume-all` 또는 `leerness rule resume <ID>` |

룰을 등록한 후 사용자에게 등록 결과(ID + trigger + 설명)를 보고하고, 그 이후 매 세션마다 자동 적용합니다. 사용자가 "중지" 또는 "제거"를 명시적으로 말하기 전까지는 룰을 비활성화하지 않습니다.

## 룰 관측과 적용 근거
rule verify/session close는 버전 변경, CHANGELOG 수정 시각, 오늘 테스트 기록의 명시적 종료 코드를 관측합니다. observed는 해당 신호를 보았다는 뜻이며 룰 전체 준수 판정이 아닙니다. 배포·검수자·금지 사항과 적용 조건은 별도 근거가 필요합니다. lastVerified의 과거 날짜는 현재 작업의 준수 증거가 아닙니다.

작업 시작 시 활성 룰의 적용 조건과 최신 사용자 지시를 확인합니다. 대체·폐기·충돌 문구가 있어도 임의로 룰을 중지하지 않습니다. 마감에는 적용 룰 ID별 수행 근거, 미검증 사유, 미준수 및 필요한 조치를 연결해 보고합니다. 해당 없음은 그 조건과 이유를 함께 기록합니다. 키워드 관측이나 rule assess의 호출자 입력만으로 승인·배포를 허용하지 않습니다.

## 검수자가 지정된 작업

작업 범위·검수자·통과 기준·최대 검수 횟수(권장 3회)를 `leerness review-feedback start --stdin`으로 먼저 고정한다. 1차·최종 검수처럼 검수자가 여럿이면 순서 있는 단계(v2 스키마, 단계마다 검수자와 최대 검수 횟수)로 고정한다. 단계는 순서대로 검수하고 NO GO를 낸 단계만 재검수하며, 그 단계가 통과해야 다음 단계가 시작된다. 각 단계는 다른 단계나 구현이 쓰지 않은 새 세션(reviewerSession)에서 검수하며, 같은 모델이 여러 단계를 맡을 수 있다. 매 검수 전 `leerness review-feedback show REVIEW-ID`를 읽고 `submit --stdin`으로 결과를 기록한다. 같은 검수 ID를 유지하고 횟수를 초기화하지 않는다.

NO GO/FAIL이면 최종 답변 자체에 TO_GO(무엇을 수정하면 GO인지)를 수정 순서대로 번호를 매긴 체크리스트로 포함한다. 각 미해결 차단 지적의 ID·수정 대상 위치·근거와 재현 방법·통과 불가 이유·바뀌어야 할 동작을 적고, 확인 가능한 통과 조건마다 확인 방법과 GO에 필요한 검증 근거를 적는다. 이어서 아직 남은 고정 기준·회귀 확인, 남은 검수 횟수, 재검수까지의 다음 순서를 적는다. `review-feedback show`가 이 경로와 다음 라운드 뼈대를 보여 준다. 판정만 쓰거나 별도 로그를 보라는 말로 끝내지 않는다. CLI 없이 검수할 때도 같은 답변 형식을 적용한다. 사용자에게는 FAIL/NEEDS_DECISION을 NO GO, PASS를 GO로 표시하되 구조화된 verdict 값은 유지한다. 각 지적에 문제·근거·통과 불가 이유·필수 개선 결과·확인 가능한 통과 조건을 포함한다. 구현 힌트는 선택이며 방법은 작업자가 결정한다. 보안·데이터 손실·API 규격·표준에 따른 필수 구현 제약은 이유와 근거를 따로 적는다. 재검수는 고정된 지적 ID와 조건의 해결 여부를 확인한다. 새 취향·범위 밖 요구는 참고 의견으로 남기고, 새 회귀만 이전/이후 근거와 함께 추가 차단 사유로 허용한다. 새 중대 위험은 범위 판단을 요청한다.

선택 제안은 GO 필수 조건과 구분한다. 검증·결정이 부족하면 필요한 실행 근거나 결정을 명시하고 코드 문제로 단정하지 않는다. 기존 지적이 해결되면 참고 의견을 새 차단 조건으로 승격하지 않는다. 기준 변경·누락·모순된 PASS는 거부된다. `NEEDS_DECISION`이면 미해결 문제와 근거·필요한 결정을 보고하고 자동 수정을 멈춘다. 횟수 소진을 통과로 바꾸지 않는다. 실제 신원·증거 확인과 기존 승인 절차는 별도다.
