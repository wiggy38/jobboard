import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/subscribe/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['@tumaa/shared'],
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:2999',
        changeOrigin: true,
      },
    },
  },
})
