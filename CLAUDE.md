<!-- leerness:managed -->
# Claude Code Instructions

@AGENTS.md

컨텍스트 읽기 범위(주 세션 담당자와 위임 작업자·검수자의 구분)는 AGENTS.md의 같은 절을 따른다.

Follow AGENTS.md. The main session owner runs `leerness handoff .` at the start and `leerness session close .` before ending a session.

**매 세션 첫 행동**: `.leerness/session-workflow.md`의 6단계 워크플로(요청분석→계획→분배→sub-agent→종합검증→마감)를 따라야 함. drift critical 시 `leerness drift check --auto-fix`로 자동 회복.

**완료 주장 전**: `leerness verify-claim <T-ID>` — 증거 없이 "완료" 라고 말하지 않는다.

Protected files must not be deleted. Read .leerness/anti-lazy-work-policy.md before claiming completion.

## 자연어 영구 룰
사용자가 "매 X마다 Y를 해줘" 같은 자연어 룰을 말하면 즉시 `leerness rule add "Y" --trigger every-X`로 등록하세요. 등록된 룰은 매 세션 `handoff`가 자동 출력하고, `session close`가 자동 검증해 보고합니다. 사용자가 "중지" / "그만" / "끄기"를 명시할 때만 `rule pause/remove`를 호출합니다.

자세한 매핑은 AGENTS.md의 "자연어 룰 처리" 표를 참고하세요.

검수자가 지정된 작업은 AGENTS.md의 검수 절차를 따른다.
