import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

/**
 * HTTPS for local development (needed so a phone on the same LAN can get a
 * secure context for camera access). Create a mkcert pair:
 *
 *   mkcert -install
 *   mkdir .cert
 *   mkcert -key-file .cert/localhost-key.pem -cert-file .cert/localhost.pem localhost 192.168.x.x
 *
 * or set HTTPS_KEY / HTTPS_CERT env vars. If no certs exist, Vite serves plain
 * HTTP — camera will only work on localhost / 127.0.0.1 then.
 */
function loadHttps() {
  const key = process.env.HTTPS_KEY
    ? path.resolve(process.env.HTTPS_KEY)
    : path.resolve(process.cwd(), '.cert', 'localhost-key.pem')
  const cert = process.env.HTTPS_CERT
    ? path.resolve(process.env.HTTPS_CERT)
    : path.resolve(process.cwd(), '.cert', 'localhost.pem')
  if (fs.existsSync(key) && fs.existsSync(cert)) {
    return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) }
  }
  return false
}

const httpsConfig = loadHttps()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  server: {
    host: '0.0.0.0', // listen on all interfaces so LAN devices can connect
    port: 5174,
    https: httpsConfig || undefined,
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
