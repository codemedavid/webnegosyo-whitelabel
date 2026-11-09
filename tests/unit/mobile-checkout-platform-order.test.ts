/**
 * The customer app's platform-Supabase order path has NEVER worked: the anon
 * role has no SELECT policy on `orders`, so `insert(...).select().single()`
 * fails wholesale (PostgREST evaluates RETURNING under the caller's RLS) and
 * every order soft-failed through to Messenger. The order-status screen read
 * the table directly and subscribed to postgres_changes — both invisible to
 * anon for the same reason.
 *
 * The fix keeps anon blind to the table:
 *  - checkout generates the order id client-side (crypto-strength native
 *    uuid.v4 from expo-modules-core, present in every shipped binary) and
 *    inserts WITHOUT a returning clause;
 *  - the status screen reads through the SECURITY DEFINER RPC
 *    `get_customer_order(uuid)` — the id is the capability — and polls,
 *    because realtime events can never reach a role with no SELECT policy.
 *
 * `mobile/` is a separate Expo app with no test runner of its own (see
 * mobile-checkout-sms-consent.test.ts for the precedent), so this guardrail
 * runs from the web suite and reads the screens' source directly.
 */

import fs from 'fs'
import path from 'path'

const MOBILE_ROOT = path.join(process.cwd(), 'mobile')

const checkoutSource = () =>
  fs.readFileSync(path.join(MOBILE_ROOT, 'app/(main)/checkout.tsx'), 'utf8')

const orderRealtimeSource = () =>
  fs.readFileSync(
    path.join(MOBILE_ROOT, 'lib/queries/use-order-realtime.ts'),
    'utf8'
  )

const platformBranch = () =>
  checkoutSource().split('// Platform flow')[1].split('// Anon reads use')[0]

describe('mobile checkout — platform order goes through the web order API', () => {
  it('never writes orders or order_items itself (the anon INSERT policies are being dropped)', () => {
    const source = checkoutSource()

    expect(source).not.toMatch(/from\('orders'\)/)
    expect(source).not.toMatch(/from\('order_items'\)/)
    expect(source).not.toContain('.insert(')
  })

  it('generates the attempt id client-side with the native crypto uuid and sends it', () => {
    expect(checkoutSource()).toContain("from 'expo-modules-core'")
    expect(platformBranch()).toContain('uuid.v4()')
    expect(platformBranch()).toContain('clientOrderId: newOrderId')
  })

  it('sends the cart lines and lets the server price them', () => {
    const branch = platformBranch()

    expect(branch).toContain('submitPlatformOrder(')
    expect(branch).toContain('items: platformLines')
    expect(branch).toContain('addon_ids')
    expect(branch).toContain('option_ids')
  })

  it('posts to the customer-app route with no secret', () => {
    const submit = fs.readFileSync(path.join(MOBILE_ROOT, 'lib/platform-order-submit.ts'), 'utf8')

    expect(submit).toContain('/api/orders/customer-app')
    expect(submit).not.toMatch(/service_role|SERVICE_ROLE|NEXT_PUBLIC/)
  })
})

describe('mobile order status — reads through the id-capability RPC', () => {
  it('fetches via get_customer_order instead of selecting the table', () => {
    const source = orderRealtimeSource()

    expect(source).toContain('.rpc')
    expect(source).toContain("'get_customer_order'")
    expect(source).not.toContain(".from('orders')")
  })

  it('polls for updates instead of a realtime channel anon can never hear', () => {
    const source = orderRealtimeSource()

    expect(source).not.toContain('postgres_changes')
    expect(source).toContain('setInterval')
    expect(source).toContain('clearInterval')
  })
})
