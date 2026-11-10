import { join } from 'path'

import { defineConfig } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

/**
 * verify-webnegosyo drive specs (release checks on sample-demo). Run from the repo root:
 *
 *   EVIDENCE=test-results/verify/<run-id> npx playwright test \
 *     -c .claude/skills/verify-webnegosyo/playwright.verify.config.ts --output "$EVIDENCE/pw-verify" [--project phone|desktop] [-g <title>]
 *
 * ALWAYS pass --output inside the evidence dir: Playwright empties its output dir at start, and the
 * default (test-results/) holds every earlier run's evidence.
 */
loadEnv({ path: '.env.local' })

const PORT = process.env.QA_PORT ?? '3100'
if (!process.env.EVIDENCE) throw new Error('EVIDENCE=<evidence dir> is required (test-results/verify/<run-id>)')

export default defineConfig({
  testDir: join(__dirname, 'drive'),
  testMatch: '**/*.spec.ts',
  outputDir: join(process.env.EVIDENCE, 'pw-verify'),
  fullyParallel: false,
  workers: 1,
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['json', { outputFile: join(process.env.EVIDENCE, 'verify-report.json') }]],
  use: {
    baseURL: `http://sample-demo.localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 240_000,
    actionTimeout: 45_000,
    // A real browser lets a tap copy; headless Chromium refuses without these.
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
})
