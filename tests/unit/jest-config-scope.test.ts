import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * This config decides which suites `npm test` runs, and it has silently been
 * running suites that belong to other apps.
 *
 * `sms/` is a standalone Expo project (the SMS reference app). Its React Native
 * sources cannot be parsed by this app's next/jest transform, so its five suites
 * fail on every run — not because anything is broken, but because they are not
 * this runner's to execute. Five permanently-red suites train everyone to read
 * "5 failed" as normal, which is how a real regression gets waved through.
 *
 * `webnegosyo-app/` was already excluded for exactly this reason; `sms/` was
 * missed when it landed.
 */
describe('root jest config scope', () => {
  const config = readFileSync(join(process.cwd(), 'jest.config.cjs'), 'utf8')

  it('does not run the standalone sms reference app', () => {
    expect(config).toContain('<rootDir>/sms/')
  })

  it('still excludes the merchant app, which has its own runner', () => {
    expect(config).toContain('<rootDir>/webnegosyo-app/')
  })

  it("still excludes the Playwright specs, which are not Jest's", () => {
    expect(config).toContain('<rootDir>/e2e/')
  })
})
