# 돈궁합 — Claude Code 작업 지침

부부 재무설계 **합의 확인** PWA. AFPK 영 플래너 챌린지 2026 선택 제출물. 개발자 1명(신준호), 11/2 게이트.

## 먼저 읽기 (순서대로)
1. `docs/00_인수인계.md` — 현재 상태, 다음 할 일, 결정 사항
2. `docs/01_앱구성.md` — 역할·화면·3주 범위·디자인 방향
3. `docs/02_AI활용범위.md` — AI가 하는 일 3개 / 3자 비교 / 부록 3번
4. `docs/03_설계사_갱신흐름.md` — 카드 버전 모델. md 교체 아님
5. `docs/04_설계검토_2026-10-11.md` — 검토에서 고친 것 · **남은 결정 3개**
6. `docs/05_평가기록.md` — 프롬프트 버전별 실측 숫자. 고칠 때마다 한 블록
7. `docs/06_보고서_초안.md` — 앱·AI·부록 3번 글 초안. 숫자는 05 에서만 가져온다

## 절대 규칙
- **제도 수치는 `src/engine/programs.ts`에만.** 출처 URL + 확인일 필수. 블로그·뉴스 값 금지. 바꾸면 테스트도 같이.
- **프롬프트를 고치면 `PROMPT_VERSIONS`의 해당 축(`judge` / `summary` / `extract`)을 올리고 `src/judge/prompt.ts` CHANGELOG에 한 줄.** 안 올리면 eval 결과 비교가 무의미해진다.
- **카드 값은 덮어쓰지 않는다.** 항상 `card_versions`에 새 행. 삭제는 `archived_at`. (DB 트리거가 막는다)
- **LLM 키는 브라우저로 가면 안 된다.** `VITE_` 접두사 금지. 호출은 `api/judge.ts`·`eval/run.ts`·`scripts/`·`vite.config.ts` 의 dev 미들웨어에서만.
- **AI는 판별·분류·요약만.** 계산·재무 조언·자동 반영·재설계 금지. 이걸 어기면 기획의 핵심 주장이 무너진다.
- **판별에서 text 카드가 아니면 LLM을 호출하지 않는다.** number/date/choice는 `src/judge/deterministic.ts`. (🔴 건 요약은 AI 활용 2번 — 판별이 아니므로 카드 타입 무관, `ENABLE_PLANNER_SUMMARY=1` 일 때만)
- **모호한 답변은 추측하지 않는다.** `unparsed` → 🟡 + `needsReview` → 설계사 큐. minor로 위조 금지.
- 용어: 코드의 `planner` = UI의 **"설계사"**. "관리자"라고 쓰지 않는다 (심사위원이 재무설계사다).
- **부부 화면에 판정·상대 답을 보여주지 않는다.** 결과는 설계사만. "앱은 듣고, 설계사가 말한다." (10.14 팀 결정, `docs/00` 참조)

## 명령
```
npm test                    # vitest. 바꾸기 전후 항상 (94건)
npm run e2e                 # 실 DB 종단 39개 (폰 2대 + 설계사). 테스트 부부가 하나 늘어난다. -- --deployed-judge
npm run seed:samples        # 예시 고객 3쌍 (이미 있으면 건너뜀)
npm run dev                 # /c/join (폰) · /p/couples (설계사). /api/judge 는 dev 미들웨어가 처리
npm run ping                # LLM 연결 확인. eval 전에 먼저
npm run eval                # golden set → 혼동행렬 2개. LLM_API_KEY 없으면 mock
npm run eval -- --repeat=3  # 자기일관성까지.  --mock 은 베이스라인
npx tsc --noEmit            # 커밋 전
node scripts/make-icons.mjs # PWA 아이콘 재생성
```

## 구조 한눈에
```
src/engine     제도 계산 (순수 TS, 테스트 19)   src/judge   3자 비교 판별 (테스트 36)
src/data       seed-cards.json · demo.ts         src/pages   couple /c/* · planner /p/*
api/judge.ts   Vercel edge, LLM 유일 호출점      supabase/   schema.sql · rls.sql · seed.sql
eval/          golden.jsonl · run.ts (테스트 12)  scripts/    extract-cards.ts · make-icons.mjs
```

## 커밋
한국어 제목, 본문에 "왜". 테스트 통과 후에만.
**`Co-Authored-By` · `Claude-Session` 트레일러를 넣지 않는다.** GitHub Contributors 에 claude 가 뜬다. 작성자는 항상 02junho.

## 화면 스크린샷
```
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --port 5180 --host 127.0.0.1   # 데모 모드(예시 데이터)로
SHOTS_BASE=http://127.0.0.1:5180 npm run shots                                             # 다른 터미널 → shots/ 10장
```
크로미움은 `npx playwright install chromium` 한 번. 다른 경로면 `PW_CHROMIUM=/path/to/chrome`.
Supabase env 를 비우는 이유: 레일에 코드 입력칸이 뜨지 않고, 데이터가 늘 같아 보고서용으로 재현된다.
