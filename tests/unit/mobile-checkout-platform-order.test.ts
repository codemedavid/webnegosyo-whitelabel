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

const supabaseBranch = () => checkoutSource().split('// Existing Supabase flow')[1]

describe('mobile checkout — platform order insert works for the anon role', () => {
  it('does not ask the insert to return the row (anon may not read orders)', () => {
    const branch = supabaseBranch()
    const insertChain = branch.slice(0, branch.indexOf('order_items'))

    expect(insertChain).not.toContain('.select()')
    expect(insertChain).not.toContain('.single()')
  })

  it('generates the order id client-side with the native crypto uuid', () => {
    expect(checkoutSource()).toContain("from 'expo-modules-core'")
    expect(supabaseBranch()).toContain('id: uuid.v4()')
  })

  it('still writes the line items and spends stock against the generated id', () => {
    const branch = supabaseBranch()

    expect(branch).toContain('order_id: orderId')
    expect(branch).toContain('notifyCustomerOrderStock(tenant.id, orderId)')
  })
})

describe('mobile order status — reads through the id-capability RPC', () => {
  it('fetches via get_customer_order instead of selecting the table', () => {
    const source = orderRealtimeSource()

    expect(source).toContain("rpc('get_customer_order'")
    expect(source).not.toContain(".from('orders')")
  })

  it('polls for updates instead of a realtime channel anon can never hear', () => {
    const source = orderRealtimeSource()

    expect(source).not.toContain('postgres_changes')
    expect(source).toContain('setInterval')
    expect(source).toContain('clearInterval')
  })
})
