import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Proxy API calls through Vite dev server so browser hits localhost:8080/api/*
    // and Vite forwards to the backend container at research-backend:8001
    proxy: {
      '/api': {
        target: 'http://research-backend:8001',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
})
