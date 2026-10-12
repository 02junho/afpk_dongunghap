# 돈궁합 — Claude Code 작업 지침

부부 재무설계 **합의 확인** PWA. AFPK 영 플래너 챌린지 2026 선택 제출물. 개발자 1명(신준호), 11/2 게이트.

## 먼저 읽기 (순서대로)
1. `docs/00_인수인계.md` — 현재 상태, 다음 할 일, 결정 사항
2. `docs/01_앱구성.md` — 역할·화면·3주 범위
3. `docs/02_AI활용범위.md` — AI가 하는 일 3개 / 3자 비교 / 부록 3번
4. `docs/03_설계사_갱신흐름.md` — 카드 버전 모델. md 교체 아님

## 절대 규칙
- **제도 수치는 `src/engine/programs.ts`에만.** 출처 URL + 확인일 필수. 블로그·뉴스 값 금지. 바꾸면 테스트도 같이.
- **프롬프트를 고치면 `PROMPT_VERSION`을 올리고 `src/judge/prompt.ts` CHANGELOG에 한 줄.** 안 올리면 eval 결과 비교가 무의미해진다.
- **카드 값은 덮어쓰지 않는다.** 항상 `card_versions`에 새 행. 삭제는 `archived_at`.
- **LLM 키는 브라우저로 가면 안 된다.** `VITE_` 접두사 금지. 호출은 `api/judge.ts`·`eval/run.ts`·`scripts/`에서만.
- **AI는 판별·분류·요약만.** 계산·재무 조언·자동 반영 금지. 이걸 어기면 기획의 핵심 주장이 무너진다.
- **text 카드가 아니면 LLM을 호출하지 않는다.** number/date/choice는 `src/judge/deterministic.ts`.
- 용어: 코드의 `planner` = UI의 **"설계사"**. "관리자"라고 쓰지 않는다 (심사위원이 재무설계사다).

## 명령
```
npm test            # vitest. 바꾸기 전후 항상
npm run dev         # /c/join (폰) · /p/queue (설계사)
npm run eval        # golden set → 혼동행렬. LLM_API_KEY 없으면 mock
npx tsc --noEmit    # 커밋 전
```

## 구조 한눈에
```
src/engine     제도 계산 (순수 TS, 테스트 18)   src/judge   3자 비교 판별 (테스트 16)
src/data       seed-cards.json (카드 10장 v1)    src/pages   couple /c/* · planner /p/*
api/judge.ts   Vercel edge, LLM 유일 호출점      supabase/   schema.sql · seed.sql
eval/          golden.jsonl · run.ts            scripts/    extract-cards.ts (선택)
```

## 커밋
한국어 제목, 본문에 "왜". 테스트 통과 후에만.

## 화면 스크린샷
`npm run dev` 띄운 뒤 다른 터미널에서 `npm run shots` → `shots/` 에 9장. 포트 5180 고정.
로컬 크로미움 경로가 다르면 `shoot.mjs`의 `executablePath`를 지우면 된다 (`npx playwright install chromium` 후).
