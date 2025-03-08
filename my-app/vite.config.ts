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
    // allowedHosts: ['test-a-testF-4lO03dzcTsS6-1948040656.us-east-2.elb.amazonaws.com'],
    allowedHosts: ['0.0.0.0']
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
