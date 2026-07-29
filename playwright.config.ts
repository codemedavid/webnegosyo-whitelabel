import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

// The seed helper needs the same Supabase credentials the app uses.
loadEnv({ path: '.env.local' })

/**
 * E2E config — local-only by design.
 *
 * Not wired into CI: the specs seed real rows into the shared Supabase project,
 * so they are run deliberately (`npm run test:e2e`) rather than on every push
 * where a half-torn-down run would fail the pipeline for unrelated work.
 *
 * Serial by default. The specs seed tenants under fixed slugs, so parallel
 * workers would race each other's setup and teardown.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
