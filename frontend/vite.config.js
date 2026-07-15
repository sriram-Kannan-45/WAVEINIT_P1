import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  server: {
    port: 5174,
    proxy: {
      // All /api/* calls → Node backend on port 3001
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Static uploads (profile images, docs) served by backend
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // WebSocket (Socket.IO) → backend
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      }
    }
  }
})