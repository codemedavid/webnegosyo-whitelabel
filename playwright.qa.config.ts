import { defineConfig } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

// The admin session helper needs the same Supabase credentials the app uses.
loadEnv({ path: '.env.local' })

/**
 * Browser QA against the `sample-demo` store (seed: scripts/seed/sample-demo-qa.ts).
 *
 *   PLATFORM_ROOT_DOMAIN=localhost:3100 npx next dev -p 3100   # in another shell
 *   npx playwright test -c playwright.qa.config.ts
 *
 * Local-only and serial: it places real (QA-SEED-tagged) orders on sample-demo
 * and publishes Page Designer edits, which the spec restores at the end.
 * Screenshots land in QA_SHOTS_DIR (default test-results/qa-shots).
 */
const PORT = process.env.QA_PORT ?? '3100'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/sample-demo-qa.spec.ts',
  fullyParallel: false,
  workers: 1,
  // Dev builds compile each route on first hit; a cold page can take a minute.
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://sample-demo.localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 240_000,
    actionTimeout: 45_000,
  },
  projects: [
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
})
