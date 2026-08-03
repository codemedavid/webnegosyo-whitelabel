/**
 * The white-labeled customer app must capture SMS consent too.
 *
 * `mobile/` is a separate Expo app with its own checkout screen and its own
 * copies of the shared helpers — it cannot import from `src/`. It also has no
 * test runner of its own, so these guardrails run from the web suite and read
 * the app's source directly. That is weaker than executing the code, and it is
 * recorded as such in the evidence report; what it does catch is the failure
 * that actually matters here — a write path that quietly forgets consent, so
 * app orders never make a customer reachable while web orders do.
 *
 * The screen has TWO order-creation paths, Convex and Supabase, chosen by the
 * tenant's backend. Consent has to ride on both or half the tenants silently
 * collect nothing.
 */

import fs from 'fs'
import path from 'path'

const MOBILE_ROOT = path.join(process.cwd(), 'mobile')

const readMobile = (relative: string) => fs.readFileSync(path.join(MOBILE_ROOT, relative), 'utf8')

describe('mobile/lib/sms-consent', () => {
  it('exists as a ported copy, since the app cannot import from src/', () => {
    expect(fs.existsSync(path.join(MOBILE_ROOT, 'lib/sms-consent.ts'))).toBe(true)
  })

  it('writes consent as a boolean, matching the web helper', () => {
    // A string "true" is rejected by both read sites. The port has to preserve
    // that or app orders look consented and are not.
    const source = readMobile('lib/sms-consent.ts')

    expect(source).toMatch(/isOptedIn: boolean/)
    expect(source).toMatch(/\[SMS_CONSENT_KEY\]: isOptedIn/)
  })
})

describe('mobile checkout screen', () => {
  const screen = () => readMobile('app/(main)/checkout.tsx')

  it('applies consent to the Convex order path', () => {
    // Everything between `path: 'orders:createOrder'` and the closing of its
    // args is the Convex write; consent must be folded into it.
    const source = screen()
    const convexPath = source.slice(source.indexOf("orders:createOrder"))

    expect(convexPath.slice(0, 600)).toMatch(/withSmsConsent/)
  })

  it('applies consent to the Supabase order path', () => {
    const source = screen()
    const supabasePath = source.slice(source.indexOf('customer_data:'))

    expect(supabasePath.slice(0, 400)).toMatch(/withSmsConsent/)
  })

  it('asks the customer rather than assuming', () => {
    expect(screen()).toMatch(/isSmsOptedIn/)
  })

  it('never pre-ticks the box', () => {
    // Anchored to the consent state itself — a bare /useState\(false\)/ would
    // match any other state in the file and pass without proving anything.
    expect(screen()).toMatch(/isSmsOptedIn[^\n]*useState[^\n]*\(false\)/)
  })
})
