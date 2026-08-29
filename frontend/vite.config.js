import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

/**
 * HTTPS for local development (optional custom certs via .cert or env vars).
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

const customHttps = loadHttps()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  server: {
    host: '0.0.0.0', // listen on all interfaces so LAN devices can connect
    port: 5174,
    ...(customHttps ? { https: customHttps } : {}),
    proxy: {
      // All /api/* calls → Node backend on port 3001 (127.0.0.1 prevents IPv6 DNS lookup delays)
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        timeout: 300000,
        proxyTimeout: 300000,
      },
      // Static uploads (profile images, docs) served by backend
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
      // WebSocket (Socket.IO) → backend
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true,
        timeout: 300000,
        proxyTimeout: 300000,
      }
    }
  },
  build: {
    target: 'esnext',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/scheduler/')) {
              return 'vendor-react';
            }
            if (id.includes('framer-motion') || id.includes('lucide-react') || id.includes('react-hot-toast')) {
              return 'vendor-ui';
            }
            if (id.includes('chart.js') || id.includes('react-chartjs-2') || id.includes('recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('@monaco-editor') || id.includes('monaco-editor')) {
              return 'vendor-monaco';
            }
            if (id.includes('@tiptap')) {
              return 'vendor-tiptap';
            }
            if (id.includes('axios') || id.includes('socket.io-client')) {
              return 'vendor-network';
            }
          }
        }
      }
    }
  }
})
