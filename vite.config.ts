import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Development-only proxy: upstream test key lives on the Node side, never in VITE_* env. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = (env.NEW_API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      proxy: {
        '/relay': {
          target, changeOrigin: true, secure: true,
          rewrite: (path) => path.replace(/^\/relay/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (request) => {
              if (env.NEW_API_TEST_TOKEN) request.setHeader('Authorization', `Bearer ${env.NEW_API_TEST_TOKEN}`)
            })
          },
        },
      },
    },
  }
})
