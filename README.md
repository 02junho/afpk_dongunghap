# 돈궁합

부부 재무설계 합의 확인 PWA. 팀 부부(富富)의 세계 — AFPK 영 플래너 챌린지 2026.

> 재무설계사가 만든 설계안을, 부부 두 사람이 정말 같게 이해하고 있는지 주기적으로 확인한다.
> 1~5단계는 사람이, 6단계(점검·수정)만 앱이. **앱은 듣고, 설계사가 말한다.**

## 먼저 읽을 것

| 문서 | 내용 |
|---|---|
| [docs/00_인수인계.md](docs/00_인수인계.md) | 현재 상태 · 10.14 팀 결정 · 다음 할 일 · 알려진 구멍 |
| [docs/01_앱구성.md](docs/01_앱구성.md) | 역할·화면·3주 범위·디자인 방향·스택 |
| [docs/02_AI활용범위.md](docs/02_AI활용범위.md) | AI가 하는 일 3개 / 안 하는 일 / **3자 비교** / 부록 3번이 쌓이는 구조 |
| [docs/03_설계사_갱신흐름.md](docs/03_설계사_갱신흐름.md) | **md 교체가 아닌 이유** · 카드 버전 · 먼저 묻기(factcheck) 루프 |
| [docs/04_설계검토_2026-10-11.md](docs/04_설계검토_2026-10-11.md) | 1주차 검토 결과 · 고친 것 · **남은 결정 3개** |

## 구조

```
src/engine/     제도 계산 엔진 (순수 TS, AI 없음)  ← 본문 숫자의 출처
src/judge/      3자 비교 판별기. number/date/choice는 결정적, text만 LLM
src/data/       seed-cards.json (카드 10장 v1, 카테고리 8개) · demo.ts (시연 데이터)
src/pages/      couple(/c/*) 폰 · planner(/p/*) 데스크톱
api/judge.ts    Vercel 함수. LLM 키는 여기만 (dev 는 vite.config.ts 미들웨어)
supabase/       schema.sql → rls.sql → seed.sql 순서로 적용
eval/           golden.jsonl + run.ts → 혼동행렬 2개·오판 목록 (부록 3번 원료)
scripts/        extract-cards.ts (설계안 → 카드 초안) · make-icons.mjs (PWA 아이콘)
shoot.mjs       화면 스크린샷 10장 (playwright)
```

## 실행

```bash
npm i
npm test                      # 엔진 19 + 판별기 36 + eval 12 = 67건
npm run dev                   # http://localhost:5173 → /c/join (폰) · /p/couples (설계사)
npm run ping                  # LLM 연결 확인 (키·모델·워크스페이스). eval 전에 먼저
npm run eval                  # LLM_API_KEY 없으면 mock
npm run eval -- --repeat=3    # 자기일관성까지. 결과는 eval/out/
npm run eval -- --mock        # 베이스라인 (키워드 겹침)
npx tsc --noEmit              # 커밋 전
node scripts/make-icons.mjs   # PWA 아이콘 재생성
npm run shots                 # 스크린샷 (dev 를 5180 포트로 띄운 뒤)
```

## 체크리스트

- [x] 제도 계산 엔진 + 테스트 (세 개의 벽, 월 상환액, 기한)
- [x] 판별기: 결정적 비교 + 3자 비교 + LLM 어댑터 + 테스트
- [x] golden set 20건 + 중간 라벨 + 라벨·실패분류 검증 테스트
- [x] eval: 혼동행렬 2개(신호등·편차) + abAgree 정확도 + 자기일관성 + 베이스라인
- [x] 부부 5화면 · 설계사 콘솔 4화면 (10.14 디자인) · PWA 아이콘
- [ ] **실제 LLM 키로 `npm run eval -- --repeat=3`** → 첫 오탐 목록
- [ ] Supabase 적용 (schema → rls → seed) · 익명 로그인
- [ ] 판정을 서버로 이동 — docs/04 §A
- [ ] 오탐 보고 프롬프트 v3 → CHANGELOG → eval 재실행 → 정확도 변화 기록

## 규칙

- 제도 수치는 `src/engine/programs.ts`에만. 출처 URL과 확인일 필수. **블로그 금지.**
- 프롬프트를 고치면 `PROMPT_VERSIONS`의 해당 축을 올리고 CHANGELOG 한 줄.
- 카드 값은 삭제·덮어쓰기 없음. 항상 새 버전 (DB 트리거가 막는다).
- LLM 키는 `VITE_` 접두사 금지. 브라우저로 가면 안 된다.
- 모호한 답변은 **추측하지 않는다**. `unparsed` → 🟡 + 설계사 확인.
- 부부 화면에 판정·상대 답을 보여주지 않는다.
