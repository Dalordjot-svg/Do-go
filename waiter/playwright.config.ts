import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.pw.ts',
  testIgnore: '**/multi.pw.ts',
  workers: 2,
  timeout: 60000,
  use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:5173' },
  webServer: [
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
    { command: 'npm run preview -- --port 4173 --strictPort --base /Do-go/waiter/', url: 'http://127.0.0.1:4173/Do-go/waiter/', reuseExistingServer: !process.env.CI }
  ]
})
