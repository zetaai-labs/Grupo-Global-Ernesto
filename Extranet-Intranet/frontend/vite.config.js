/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // hls.js (video bios) and livekit-client (large meetings) are ~550 kB but load only when used.
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      '/api': {
        // Override with BACKEND_URL when the API runs elsewhere (e.g. BACKEND_URL=http://localhost:5001).
        target: process.env.BACKEND_URL || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
