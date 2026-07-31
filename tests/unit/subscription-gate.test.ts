/**
 * The web admin's half of the subscription gate.
 *
 * Two layers, and the distinction matters: the layout redirect is UX, the
 * server-action guard is the boundary. A redirect alone stops nobody — a
 * paused merchant can still POST straight at a server action, because a
 * `redirect()` in a layout is a rendering decision, not an authorization one.
 *
 * The superadmin exemption is load-bearing in both layers. They are the only
 * account that can clear an unpaid subscription; locking them out of the tool
 * they collect with would make the feature unfixable from inside itself.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

import { assertSubscriptionActive, SUBSCRIPTION_PAUSED_MESSAGE } from '@/lib/billing/subscription-gate'

const ROOT = join(__dirname, '..', '..')

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), 'utf8')
}

const NOW = '2026-08-10T07:00:00.000Z'

const PAID = { status: 'active', paid_through: '2026-08-31', grace_days: 3 }
const IN_GRACE = { status: 'past_due', paid_through: '2026-08-09', grace_days: 3 }
const LAPSED = { status: 'past_due', paid_through: '2026-07-31', grace_days: 3 }

describe('assertSubscriptionActive', () => {
  it('lets a paid merchant through', () => {
    expect(() => assertSubscriptionActive(PAID, { role: 'admin' }, NOW)).not.toThrow()
  })

  it('lets a merchant inside the grace window through', () => {
    expect(() => assertSubscriptionActive(IN_GRACE, { role: 'admin' }, NOW)).not.toThrow()
  })

  it('refuses a lapsed merchant', () => {
    expect(() => assertSubscriptionActive(LAPSED, { role: 'admin' }, NOW)).toThrow(
      SUBSCRIPTION_PAUSED_MESSAGE
    )
  })

  it('never refuses a superadmin', () => {
    // The only account that can clear the debt must not be stopped by it.
    expect(() => assertSubscriptionActive(LAPSED, { role: 'superadmin' }, NOW)).not.toThrow()
  })

  it('lets a merchant through when no subscription row exists', () => {
    // Absence is an unbilled tenant or a failed read, never a delinquent one.
    expect(() => assertSubscriptionActive(null, { role: 'admin' }, NOW)).not.toThrow()
  })

  it('gives the merchant a message that says what to do', () => {
    // This string reaches a restaurant owner mid-service. "Forbidden" would
    // send them to support with nothing to go on.
    expect(SUBSCRIPTION_PAUSED_MESSAGE).toMatch(/subscription/i)
  })
})

describe('web gate wiring', () => {
  it('gates the admin layout on the subscription', () => {
    const layout = read('src', 'app', '[tenant]', 'admin', 'layout.tsx')

    expect(layout).toContain('resolveSubscriptionAccess')
  })

  it('exempts a superadmin from the layout redirect', () => {
    // Without this the platform owner cannot open a lapsed tenant to fix it.
    const layout = read('src', 'app', '[tenant]', 'admin', 'layout.tsx')

    expect(layout).toMatch(/superadmin/)
  })

  it('ships the paused screen the layout redirects to', () => {
    expect(() => read('src', 'app', '[tenant]', 'subscription', 'page.tsx')).not.toThrow()
  })

  it('puts the paused screen outside the admin tree it redirects out of', () => {
    // A paused screen rendered under the admin layout would be caught by the
    // very redirect that sent the merchant there — a loop the browser gives up
    // on, showing them an error page instead of an explanation.
    const layout = read('src', 'app', '[tenant]', 'admin', 'layout.tsx')

    expect(layout).toContain('/subscription`')
    expect(layout).not.toContain('/admin/subscription`')
  })

  it('does not gate the customer storefront', () => {
    // The whole commercial choice: a paused merchant keeps selling. If this
    // ever appears in the storefront tenant read, an unpaid ₱649 has just
    // taken a restaurant's ordering page down.
    const storefront = read('src', 'lib', 'queries', 'fetch-tenant-by-slug.ts')

    expect(storefront).not.toContain('subscription')
  })
})
