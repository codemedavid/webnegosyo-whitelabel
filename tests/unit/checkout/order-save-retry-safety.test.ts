/**
 * Which tenants may have their order save retried.
 *
 * Retrying `createOrderAction` is only safe where the server dedupes on
 * `client_order_id`. An audit of the three order backends found that is true
 * of exactly one of them today:
 *
 *  - platform (shared Supabase): SAFE. `orders_tenant_client_order_id_uq` is a
 *    partial unique index on (tenant_id, client_order_id), and
 *    `isDuplicateClientOrderId` turns the collision into a deduped success.
 *  - convex: UNSAFE. The Convex mutation accepts `clientOrderId` and dedupes on
 *    `by_client_order_id`, but `createOrderConvex` never forwards it. A retry
 *    creates a second live order and re-runs every side effect — burning
 *    vouchers again, depleting stock again, pushing to Loyverse again.
 *  - tenant's-own Supabase: UNSAFE. No `client_order_id` column, no index, no
 *    dedupe lookup of any kind.
 *
 * So this decision fails closed. An unknown or unreadable backend gets exactly
 * one attempt — today's behaviour — because a duplicate live order is a worse
 * outcome for a merchant than a retry they never got.
 */

import { isOrderSaveRetrySafe } from '@/lib/checkout/durable-order-save'

describe('isOrderSaveRetrySafe', () => {
  it('allows a retry on the shared platform backend, which dedupes on client_order_id', () => {
    expect(isOrderSaveRetrySafe({ order_backend: 'platform', convex_deployment_url: null })).toBe(true)
  })

  it('allows a retry for an auto tenant with no Convex deployment, which resolves to platform', () => {
    expect(isOrderSaveRetrySafe({ order_backend: 'auto', convex_deployment_url: null })).toBe(true)
  })

  it('refuses to retry a Convex tenant, where a retry would create a second live order', () => {
    expect(isOrderSaveRetrySafe({ order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' })).toBe(false)
  })

  it('refuses to retry an auto tenant that has a Convex deployment', () => {
    // `resolveOrderBackend` routes these to Convex, so they are unsafe too.
    expect(isOrderSaveRetrySafe({ order_backend: 'auto', convex_deployment_url: 'https://x.convex.cloud' })).toBe(false)
  })

  it('refuses to retry a tenant on its own Supabase project, which has no idempotency at all', () => {
    expect(isOrderSaveRetrySafe({ order_backend: 'supabase', convex_deployment_url: null })).toBe(false)
  })

  it('refuses to retry when there is no tenant to judge', () => {
    expect(isOrderSaveRetrySafe(null)).toBe(false)
  })

  it('refuses to retry when the backend fields were never projected', () => {
    // A narrowed storefront SELECT that drops `convex_deployment_url` would
    // otherwise read as "no Convex" and wrongly unlock retries for a Convex
    // tenant. This repo has shipped that exact class of projection drift before.
    expect(isOrderSaveRetrySafe({} as never)).toBe(false)
  })
})
