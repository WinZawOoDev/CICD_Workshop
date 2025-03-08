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
    allowedHosts:[ 'd310n6l00nl5i9.cloudfront.net', 'test-a-testF-4lO03dzcTsS6-1948040656.us-east-2.elb.amazonaws.com']
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },  
})
