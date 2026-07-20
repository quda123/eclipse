import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Authenticated scenarios share one seeded local database. Serial execution
  // prevents the desktop and mobile projects from mutating the same fixtures.
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
