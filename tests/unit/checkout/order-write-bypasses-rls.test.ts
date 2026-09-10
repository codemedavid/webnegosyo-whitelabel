/**
 * The checkout order INSERT must never run through the visitor's session.
 *
 * `public.orders` grants exactly one INSERT policy to a customer:
 *
 *   orders_insert_customer  INSERT  TO anon
 *     WITH CHECK (status = 'pending' AND payment_status = 'pending' AND tenant.is_active)
 *
 * It is granted to `anon` ONLY. The other policy, `orders_write_admin`, needs
 * `app_user_may_see_order(tenant_id, outlet_id)` — true for that tenant's own
 * admins and for superadmins, false for everyone else. So a visitor who also
 * holds a login in the same browser (a merchant testing their own storefront, a
 * superadmin reviewing a shop, an owner signed into a different store) submits
 * as `authenticated`, matches neither policy, and the INSERT is refused with
 * "new row violates row-level security policy for table \"orders\"".
 *
 * That is not hypothetical: it silently destroyed every web order for a live
 * tenant, because the checkout confirmation screen renders before the save.
 * Every value on the row is already server-validated by this point (tenant,
 * prices, order type, payment method, hours, stock), so RLS adds nothing here
 * and subtracts a whole tenant's sales.
 *
 * This is a source-level guard on purpose. The failure it prevents is a
 * one-word edit — `supabase` in place of `orderWriter` — that no behavioural
 * test with a mocked client would notice, because a mock has no RLS.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const SOURCE = readFileSync(
  join(process.cwd(), 'src/lib/orders-service.ts'),
  'utf8'
)

/** The body of `createOrder`, up to the next top-level declaration. */
function createOrderBody(): string {
  const start = SOURCE.indexOf('export async function createOrder(')
  expect(start).toBeGreaterThan(-1)

  const end = SOURCE.indexOf('// Helper function to get order type name', start)
  expect(end).toBeGreaterThan(start)

  return SOURCE.slice(start, end)
}

describe('createOrder writes through the service role, not the visitor session', () => {
  it('derives its order writer from the admin (service-role) client', () => {
    const body = createOrderBody()

    expect(body).toMatch(/const orderWriter = createAdminClient\(\)/)
  })

  it('inserts the order row through that writer', () => {
    const body = createOrderBody()

    expect(body).toMatch(/await orderWriter\s*\n?\s*\.from\('orders'\)\s*\n?\s*\.insert\(/)
  })

  it('inserts the order items through that writer too', () => {
    // Order items carry the same story: a half-written order (row saved, lines
    // refused) is worse than no order, because the merchant sees a sale with
    // nothing to cook.
    const body = createOrderBody()

    expect(body).toMatch(/await orderWriter\s*\n?\s*\.from\('order_items'\)/)
  })

  it('never routes an orders or order_items write through the RLS-bound client', () => {
    const body = createOrderBody()

    // `supabase` in this function is the cookie-bound server client. It is the
    // right tool for the reads above (they are all public storefront data); it
    // is never the right tool for these two writes.
    expect(body).not.toMatch(/supabase\s*\n?\s*\.from\('orders'\)\s*\n?\s*\.insert\(/)
    expect(body).not.toMatch(/supabase\s*\n?\s*\.from\('order_items'\)\s*\n?\s*\.insert\(/)
  })
})
