/**
 * 프롬프트는 버전을 가진다. 고치면 해당 버전을 올리고 아래 CHANGELOG에 한 줄 남긴다.
 * judgments.prompt_version 에 저장되므로, 어떤 판정이 어느 프롬프트에서 나왔는지 추적된다.
 *
 * 프롬프트가 여러 개이므로 버전도 축이 여러 개다. 상수 하나로 두면
 * 요약 프롬프트를 고쳤을 때 판별 eval 결과가 같이 오염된다.
 *
 * CHANGELOG
 * judge v1  최초. 3자 비교 (A vs 전제, B vs 전제, A·B 일치).
 * judge v2  abAgree 의 정의를 명시('양립 가능한가'). v1은 정의가 없어서
 *           "서로 다른 부분을 말하는" 답변쌍(golden g15·g17)을 불일치로 떨어뜨렸다.
 *           판단 순서·출력 예시 추가. 전제가 복수 항목일 때의 지침 추가.
 * summary v1  🔴 건 설계사용 3줄 요약 (AI 활용 2번). 조언·계산 금지.
 */
export const PROMPT_VERSIONS = {
  judge: 'v2',
  summary: 'v1',
} as const

/** @deprecated PROMPT_VERSIONS.judge 를 쓸 것. eval 출력 파일명 호환용으로 남겨둔다. */
export const PROMPT_VERSION = PROMPT_VERSIONS.judge

type PromptCard = { label: string; question: string; plannedValue: string | number; stake: string }

export function buildPrompt(card: PromptCard, a: string, b: string) {
  return `당신은 부부 재무설계 보조 도구입니다. 재무 조언은 하지 않습니다. 오직 세 가지만 판단합니다.

[설계 전제]
항목: ${card.label}
질문: ${card.question}
재무설계사가 설정한 전제: ${card.plannedValue}
이 전제가 흔들리면: ${card.stake}

[답변]
남편: ${a}
아내: ${b}

[판단 1·2] 각 답변이 전제와 얼마나 다른가 (aVsPlan, bVsPlan)
- "match": 전제와 같은 뜻. 표현만 다른 경우 포함 ("내년 봄" ≈ "2027년 3월" 처럼 시점이 겹치면 match).
- "minor": 전제와 방향은 같지만 정도·시점이 조금 다름. 또는 조건부/유보적 표현.
- "major": 전제와 다른 뜻이거나 반대 방향. 또는 전제 자체를 부정.
- 전제가 여러 항목으로 이루어져 있고 답변이 그중 일부만 말했다면, **말한 부분만** 보고 판단합니다.
  말하지 않은 항목은 부정한 것이 아닙니다.

[판단 3] 두 답변이 서로 양립하는가 (abAgree)
- abAgree 는 "두 답변이 **동시에 참일 수 있는가**" 입니다. 같은 문장인지가 아닙니다.
- 서로 다른 부분을 말하는 것은 불일치가 **아닙니다**. 예: 한쪽은 "전세 때 8천 받았다",
  다른 쪽은 "매수 때 1.5억 받는다" → 둘 다 참일 수 있으므로 abAgree = true.
- 한쪽이 다른 쪽의 내용을 **부정·배제**할 때만 false 입니다. 예: "1.5억 받는다" vs "그건 빌리는 거다" → false.
- 한쪽이 "모르겠다"고만 했다면 부정이 아니므로 abAgree = true 로 둡니다.

[공통 지침]
- 확신이 없으면 minor 로 둡니다. 다른 뜻을 같다고 하는 것보다 같은 뜻을 다르다고 하는 편이 낫습니다
  (사용자가 이의 제기로 바로잡을 수 있음).
- 가치관·감정의 차이는 판단하지 않습니다. 사실·계획의 차이만 봅니다.
- 금액·기한을 계산하지 않습니다. 판정도 하지 않습니다. 위 세 값만 고릅니다.

반드시 아래 JSON만 출력하세요. 다른 텍스트 금지.
{"aVsPlan":"match|minor|major","bVsPlan":"match|minor|major","abAgree":true|false,"reason":"한국어 한 문장"}`
}

/**
 * 🔴 건의 설계사용 요약 (AI 활용 2번). 입력에 판정이 이미 들어 있다 — AI는 판정하지 않는다.
 * 조언·계산 금지. "무엇이 어긋났는지"만 3줄.
 */
export function buildSummaryPrompt(
  card: PromptCard,
  a: string,
  b: string,
  judgment: { verdict: string; redKind?: string; reason?: string },
) {
  const kind = judgment.redKind === 'plan_stale'
    ? '전제 폐기 (부부는 서로 일치하는데 설계 전제가 현실과 어긋남)'
    : judgment.redKind === 'repeated_yellow'
      ? '2회 연속 🟡 승격 (작은 차이가 반복됨)'
      : '부부 불일치 (두 사람의 답이 서로 어긋남)'
  return `당신은 재무설계사의 보조 도구입니다. 아래 건을 설계사가 30초 안에 파악할 수 있게 3줄로 요약하세요.

[카드] ${card.label} — ${card.question}
[설계 전제] ${card.plannedValue}
[이 전제가 흔들리면] ${card.stake}
[남편 답변] ${a}
[아내 답변] ${b}
[판정] ${kind}${judgment.reason ? ` · ${judgment.reason}` : ''}

[규칙]
- 1줄: 무엇이 어긋났는지 (사실만)
- 2줄: 그래서 설계의 무엇이 영향을 받는지 (위 '흔들리면' 내용을 근거로)
- 3줄: 설계사가 확인해야 할 것 한 가지 (질문 형태)
- 금액·기한을 새로 계산하지 않습니다. 주어진 값만 인용합니다.
- 조언하지 않습니다 ("~하세요" 금지). 판정을 바꾸지 않습니다.
- 각 줄 40자 이내. 줄바꿈으로 구분. 다른 텍스트 없이 3줄만 출력하세요.`
}
