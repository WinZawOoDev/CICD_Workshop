/// <reference types='vite/client' />
/// <reference types='vitest' />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/my-app',
  server: {
    host: true,
    port: 8081,
    allowedHosts: ['test-a-testf-4lo03dzctss6-1948040656.us-east-2.elb.amazonaws.com'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
