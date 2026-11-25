import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/mobile.pw.ts',
  timeout: 60000,
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:5173', reducedMotion: 'no-preference' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'], deviceScaleFactor: 1 } },
    { name: 'android', use: { ...devices['Pixel 7'], deviceScaleFactor: 1 } }
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI
  }
})
