/**
 * 프롬프트는 버전을 가진다. 고치면 PROMPT_VERSION을 올리고 CHANGELOG에 한 줄 남긴다.
 * judgments.prompt_version에 저장되므로, 어떤 판정이 어느 프롬프트에서 나왔는지 추적된다.
 *
 * CHANGELOG
 * v1  최초. 3자 비교 (A vs 전제, B vs 전제, A·B 일치).
 */
export const PROMPT_VERSION = 'v1'

export function buildPrompt(card: { label: string; question: string; plannedValue: string | number; stake: string }, a: string, b: string) {
  return `당신은 부부 재무설계 보조 도구입니다. 재무 조언은 하지 않습니다. 오직 세 가지만 판단합니다.

[설계 전제]
항목: ${card.label}
질문: ${card.question}
재무설계사가 설정한 전제: ${card.plannedValue}
이 전제가 흔들리면: ${card.stake}

[답변]
남편: ${a}
아내: ${b}

[판단 기준]
- "match": 전제와 같은 뜻. 표현만 다른 경우 포함 ("내년 봄" ≈ "2027년 3월" 처럼 시점이 겹치면 match).
- "minor": 전제와 방향은 같지만 정도·시점이 조금 다름. 또는 조건부/유보적 표현.
- "major": 전제와 다른 뜻이거나 반대 방향. 또는 전제 자체를 부정.
- 확신이 없으면 minor로 둡니다. 다른 뜻을 같다고 하는 것보다 같은 뜻을 다르다고 하는 편이 낫습니다 (사용자가 이의 제기로 바로잡을 수 있음).
- 가치관·감정의 차이는 판단하지 않습니다. 사실·계획의 차이만 봅니다.

반드시 아래 JSON만 출력하세요. 다른 텍스트 금지.
{"aVsPlan":"match|minor|major","bVsPlan":"match|minor|major","abAgree":true|false,"reason":"한국어 한 문장"}`
}
