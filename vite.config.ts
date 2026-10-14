import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * dev 에서도 /api/judge 가 돌게 한다. 없으면 vite 가 SPA fallback 으로 index.html 을
 * 200 으로 돌려주고, text 카드가 "판정 중…"에서 멈춘다 (원인을 찾기 어려운 실패).
 * 이 핸들러는 **node 쪽에서만** 돈다 — 키는 브라우저로 가지 않는다.
 * 배포는 api/judge.ts (Vercel edge) 가 처리한다. 둘의 동작을 같게 유지할 것.
 */
function devJudgeApi(): Plugin {
  return {
    name: 'dev-judge-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/judge', async (req, res) => {
        const send = (code: number, body: unknown) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { error: 'POST only' })
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const { card, a, b, previousVerdict } = JSON.parse(Buffer.concat(chunks).toString())
          const { judge } = await import('./src/judge/index')
          const { createLlmClient, mockLlm } = await import('./src/judge/text-llm')
          const key = process.env.LLM_API_KEY
          const llm = key
            ? createLlmClient({ apiKey: key, model: process.env.LLM_MODEL!, baseUrl: process.env.LLM_BASE_URL, workspaceId: process.env.LLM_WORKSPACE_ID })
            : mockLlm
          if (!key) server.config.logger.warn('⚠ LLM_API_KEY 없음 → mock 판정 (품질 측정 아님)')
          send(200, await judge(card, a, b, llm, { previousVerdict }))
        } catch (e) {
          send(200, {
            verdict: 'yellow', aVsPlan: 'unparsed', bVsPlan: 'unparsed', abAgree: false,
            reason: `판정 실패: ${(e as Error).message}`, method: 'llm', needsReview: true,
          })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    devJudgeApi(),
    VitePWA({
      registerType: 'autoUpdate',
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
