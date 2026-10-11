# 돈궁합

부부 재무설계 합의 확인 PWA. 팀 부부(富富)의 세계 — AFPK 영 플래너 챌린지 2026.

> 재무설계사가 만든 설계안을, 부부 두 사람이 정말 같게 이해하고 있는지 주기적으로 확인한다.
> 1~5단계는 사람이, 6단계(점검·수정)만 앱이.

## 먼저 읽을 것

| 문서 | 내용 |
|---|---|
| [docs/01_앱구성.md](docs/01_앱구성.md) | 역할·화면·3주 범위·스택 |
| [docs/02_AI활용범위.md](docs/02_AI활용범위.md) | AI가 하는 일 3개 / 안 하는 일 / **3자 비교** / 부록 3번이 쌓이는 구조 |
| [docs/03_설계사_갱신흐름.md](docs/03_설계사_갱신흐름.md) | **md 교체가 아닌 이유** · 카드 버전 · 재합의 루프 |

## 구조

```
src/engine/     제도 계산 엔진 (순수 TS, AI 없음)  ← 본문 숫자의 출처
src/judge/      3자 비교 판별기. number/date/choice는 결정적, text만 LLM
src/data/       seed-cards.json — 김현우·박지우 카드 10장 v1
src/pages/      couple(/c/*) 폰 · planner(/p/*) 데스크톱
api/judge.ts    Vercel 함수. LLM 키는 여기만
supabase/       schema.sql · seed.sql
eval/           golden.jsonl + run.ts → 혼동행렬·오탐 목록 (부록 3번 원료)
scripts/        extract-cards.ts — 설계안 문서 → 카드 초안 (선택)
```

## 실행

```bash
npm i
npm test          # 엔진 + 판별기 테스트
npm run dev       # http://localhost:5173  →  /c/join (폰) · /p/queue (설계사)
npm run eval      # LLM_API_KEY 없으면 mock. 있으면 실제 판정 → eval/out/ 저장
```

## 1주차 체크리스트

- [x] 제도 계산 엔진 + 테스트 (세 개의 벽, 월 상환액, 기한)
- [x] 판별기: 결정적 비교 + 3자 비교 로직 + LLM 어댑터 + 테스트
- [x] golden set 15건
- [ ] 실제 LLM 키로 `npm run eval` 돌려서 첫 오탐 목록 확보
- [ ] golden set 30건까지 — 특히 한국어 뉘앙스·시점 표현·증여 vs 차용
- [ ] 오탐 보고 프롬프트 v2 → CHANGELOG → eval 재실행 → 정확도 변화 기록

## 규칙

- 제도 수치는 `src/engine/programs.ts`에만. 출처 URL과 확인일 필수. **블로그 금지.**
- 프롬프트를 고치면 `PROMPT_VERSION` 올리고 CHANGELOG 한 줄.
- 카드 값은 삭제·덮어쓰기 없음. 항상 새 버전.
- LLM 키는 `VITE_` 접두사 금지. 브라우저로 가면 안 된다.
