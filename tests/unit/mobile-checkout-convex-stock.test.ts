/**
 * The white-labeled customer app has TWO order-creation paths, Convex and
 * Supabase, chosen by the tenant's backend. Only the Supabase branch told the
 * platform to spend the order's ingredients — so an order placed in a branded
 * app on a Convex tenant depleted nothing while the identical order on a
 * platform tenant moved stock, raised low-stock alerts and could auto-86.
 *
 * `mobile/` is a separate Expo app with no test runner of its own (see
 * mobile-checkout-sms-consent.test.ts for the precedent), so this guardrail
 * runs from the web suite and reads the screen's source directly. Weaker than
 * executing the code, but it catches the failure that matters: a write path
 * that quietly forgets to notify inventory.
 */

import fs from 'fs'
import path from 'path'

const MOBILE_ROOT = path.join(process.cwd(), 'mobile')

const checkoutSource = () =>
  fs.readFileSync(path.join(MOBILE_ROOT, 'app/(main)/checkout.tsx'), 'utf8')

describe('mobile checkout — inventory notification rides both backends', () => {
  it('leaves inventory to the order API on the platform branch', () => {
    // The platform branch posts to /api/orders/customer-app, whose
    // createOrderAction spends the ingredients. A second call from here would
    // only race the ledger's order+direction guard for nothing.
    const platformBranch = checkoutSource().split('// Platform flow')[1]

    expect(platformBranch).toContain('submitPlatformOrder(')
    expect(platformBranch.split('// Anon reads use')[0]).not.toContain('notifyCustomerOrderStock')
  })

  it('notifies inventory on the Convex branch too', () => {
    // The Convex branch ends where the Supabase one begins. The notification
    // must appear after the order id comes back from `orders:createOrder` —
    // the platform reads the lines back out of the deployment, so calling with
    // no order would find nothing to spend.
    const [convexBranch] = checkoutSource()
      .split('// Platform flow')[0]
      .split('// Create order in Convex')
      .slice(1)

    expect(convexBranch).toContain("convexResult.status === 'success'")
    expect(convexBranch).toContain('notifyCustomerOrderStock(tenant.id, orderId)')
  })

  it('passes the Convex order id through untouched', () => {
    // The ledger's order_id column is TEXT specifically so a Convex id fits.
    // The screen must send the id Convex returned, not a translation of it.
    const source = checkoutSource()

    expect(source).toContain('orderId = convexResult.value')
  })
})
