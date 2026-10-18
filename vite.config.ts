import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * dev 에서도 /api/* 가 돌게 한다 — 배포에서 쓰는 edge 핸들러(api/*.ts)를 그대로 호출한다.
 * 없으면 vite 가 SPA fallback 으로 index.html 을 200 으로 돌려주고, 원인을 찾기 어려운 실패가 된다.
 * 핸들러는 node 쪽에서만 돈다 — 키는 브라우저로 가지 않는다. dev/prod 동작이 같아야 한다.
 *
 * dev 편의: ALLOW_DEMO_JUDGE 가 없으면 1 로, LLM 키가 없으면 LLM_MOCK=1 로 둔다 (경로 확인용).
 */
function devApi(): Plugin {
  const handlers: Record<string, () => Promise<{ default: (req: Request) => Promise<Response> }>> = {
    judge: () => import('./api/judge'),
    planner: () => import('./api/planner'),
  }
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      // .env 의 서버용 변수(LLM_*, SUPABASE_SERVICE_ROLE_KEY, PLANNER_PASSCODE)를 핸들러가 읽게 한다.
      // Vite 는 VITE_ 접두사만 브라우저로 보내고, 나머지는 여기서만 process.env 에 올린다. 셸에서 source 한 값이 우선.
      // VITE_ 도 올린다 — 핸들러가 SUPABASE_URL 대신 VITE_SUPABASE_URL 을 읽는다 (Vercel 도 함수에 전부 노출한다)
      const fileEnv = loadEnv(server.config.mode, server.config.root, '')
      for (const [k, v] of Object.entries(fileEnv)) process.env[k] ??= v
      process.env.ALLOW_DEMO_JUDGE ??= '1'
      if (!process.env.LLM_API_KEY) {
        process.env.LLM_MOCK = '1'
        server.config.logger.warn('⚠ LLM_API_KEY 없음 → text 카드는 mock 판정 (품질 측정 아님)')
      }
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) server.config.logger.warn('⚠ SUPABASE_SERVICE_ROLE_KEY 없음 → 라운드 판정·설계사 API 는 500')
      if (!process.env.PLANNER_PASSCODE) { process.env.PLANNER_PASSCODE = 'dev'; server.config.logger.info('ℹ PLANNER_PASSCODE 없음 → dev 에서는 "dev"') }

      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z]+)(?:\?|$)/)
        if (!m || !handlers[m[1]]) return next()
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          })
          const mod = await handlers[m[1]]()
          const response = await mod.default(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: `dev api: ${(e as Error).message}` }))
        }
      })
    },
  }
}

// 화면 구석에 찍는 빌드 시각(한국 시간). 이 기기가 어느 배포를 보고 있는지 눈으로 확인한다 (10.18 캐시 혼동)
const BUILD_ID = new Date(Date.now() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ')

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    devApi(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // src/main.tsx 의 registerSW 가 등록한다 (업데이트 시 자동 새로고침)
      manifest: {
        name: '돈궁합',
        short_name: '돈궁합',
        description: '부부 재무설계 합의 확인',
        lang: 'ko',
        display: 'standalone',
        start_url: '/c/home',
        theme_color: '#1f2937',
        background_color: '#ffffff',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          // 안드로이드 원형 마스크 대응. 생성: node scripts/make-icons.mjs
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'eval/**/__tests__/**/*.test.ts']
  }
} as any)
