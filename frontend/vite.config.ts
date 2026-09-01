import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api/v2/validate': {
        target: 'https://us-central1-prok-digitalga.cloudfunctions.net',
        changeOrigin: true,
        rewrite: () => '/validatePasscode',
      },
      '/api/v2/vote': {
        target: 'https://us-central1-prok-digitalga.cloudfunctions.net',
        changeOrigin: true,
        rewrite: () => '/castVote',
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
        }
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
