import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// En desarrollo, /api se redirige al servidor PHP local (php -S localhost:8000 ...).
// Así frontend y API comparten origen y no hace falta habilitar CORS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
