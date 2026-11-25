import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/multi.pw.ts',
  workers: 1,
  timeout: 45000,
  use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:5174' },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    env: { VITE_WAITER_EMULATOR_HOST: process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '127.0.0.1:9000' }
  }
})
