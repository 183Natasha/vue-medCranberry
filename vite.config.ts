import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Конфиг-сервер (server/server.mjs): раздаёт settings.yaml и пишет файловые логи.
  // Запускается отдельно: npm run server
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/settings.yaml': 'http://localhost:3001',
      '/api': 'http://localhost:3001',
    },
  },
})
