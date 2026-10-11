import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
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
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts']
  }
} as any)
