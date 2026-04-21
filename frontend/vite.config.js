import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_URL || 'http://127.0.0.1:8765'

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/ws':  { target: apiTarget.replace('http', 'ws'), ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  }
})
