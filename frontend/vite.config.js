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
    // Monaco is intentionally loaded only after a coding editor opens. Avoid
    // injecting global modulepreload tags for its bundled workers/languages.
    modulePreload: false,
    chunkSizeWarningLimit: 800,
    // Strip console.* and debugger statements from production bundles
    ...(process.env.NODE_ENV === 'production' ? {
      minify: 'terser',
      terserOptions: {
        compress: { drop_console: true, drop_debugger: true },
        format: { comments: false },
      },
    } : {}),
    rollupOptions: {
      output: {
        hoistTransitiveImports: false,
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('vite/preload-helper') || normalized.includes('vite/modulepreload-polyfill')) {
            return 'vendor-preload';
          }
          if (normalized.includes('/node_modules/')) {
            if (
              normalized.includes('/node_modules/@monaco-editor/') ||
              normalized.includes('/node_modules/monaco-editor/')
            ) {
              return 'vendor-monaco';
            }
            if (normalized.includes('/node_modules/@tiptap/')) {
              return 'vendor-tiptap';
            }
            if (
              normalized.includes('/node_modules/chart.js/') ||
              normalized.includes('/node_modules/react-chartjs-2/') ||
              normalized.includes('/node_modules/recharts/')
            ) {
              return 'vendor-charts';
            }
            if (
              normalized.includes('/node_modules/framer-motion/') ||
              normalized.includes('/node_modules/lucide-react/') ||
              normalized.includes('/node_modules/react-hot-toast/')
            ) {
              return 'vendor-ui';
            }
            if (
              normalized.includes('/node_modules/axios/') ||
              normalized.includes('/node_modules/socket.io-client/')
            ) {
              return 'vendor-network';
            }
            if (
              normalized.includes('/node_modules/react/') ||
              normalized.includes('/node_modules/react-dom/') ||
              normalized.includes('/node_modules/react-router/') ||
              normalized.includes('/node_modules/react-router-dom/') ||
              normalized.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
          }
        }
      }
    }
  }
})
