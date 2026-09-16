/** @jest-environment node */
jest.mock('server-only', () => ({}))
import type { SupabaseClient } from '@supabase/supabase-js'
import { isFullyRefundedRewardSale, reconcileLoyaltyRefunds } from '@/lib/loyalty/refund-reconciliation'
import { earnLoyaltyForFact } from '@/lib/loyalty/apply'
jest.mock('@/lib/loyalty/store', () => ({ createSupabaseLoyaltyDeps: () => ({}), loadLoyaltyOrderFact: async () => ({ status: 'confirmed' }) }))
jest.mock('@/lib/loyalty/apply', () => ({ earnLoyaltyForFact: jest.fn().mockResolvedValue({ action: 'reversed' }) }))
it('requires a full financial refund, not a refunded status or partial payment', () => {
  expect(isFullyRefundedRewardSale({ status: 'confirmed', totalCentavos: 5000, chargedCentavos: 5000, refundedCentavos: 5000 }, 5000)).toBe(true)
  expect(isFullyRefundedRewardSale({ status: 'refunded', totalCentavos: 5000, chargedCentavos: 5000, refundedCentavos: 1000 }, 5000)).toBe(false)
  expect(isFullyRefundedRewardSale({ status: 'refunded', totalCentavos: 5000, chargedCentavos: 0, refundedCentavos: 0 }, 5000)).toBe(false)
  expect(isFullyRefundedRewardSale({ status: 'confirmed', totalCentavos: 5000, chargedCentavos: 7000, refundedCentavos: 5000 }, 5000)).toBe(false)
})

it('reverses earning and restores only after an authoritative destination ledger read', async () => {
  let refunded = 1000
  const rpc = jest.fn(async (name: string) => {
    if (name === 'claim_loyalty_refund_checks') return { data: [{ tenant_id: 'tenant', settlement_id: 'receipt', external_order_id: 'order', order_backend: 'platform_supabase' }], error: null }
    if (name === 'read_loyalty_refund_evidence') return { data: { status: 'refunded', totalCentavos: 5000, chargedCentavos: 5000, refundedCentavos: refunded }, error: null }
    return { data: true, error: null }
  })
  const from = (table: string) => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === 'tenants' ? { order_backend: 'platform' } : { total_centavos: 5000 }, error: null }) }
    return query
  }
  const admin = { rpc, from } as unknown as SupabaseClient
  expect((await reconcileLoyaltyRefunds(admin)).restored).toBe(0)
  expect(earnLoyaltyForFact).not.toHaveBeenCalled()
  refunded = 5000
  expect((await reconcileLoyaltyRefunds(admin)).restored).toBe(1)
  expect(earnLoyaltyForFact).toHaveBeenCalledWith(expect.objectContaining({ status: 'refunded' }), { tenantId: 'tenant', isShadow: false }, expect.anything())
  expect(rpc).toHaveBeenLastCalledWith('restore_loyalty_refunded_receipt', { p_tenant_id: 'tenant', p_settlement_id: 'receipt' })
})
it('restores a zero-payable reward sale only after cancellation, never during ordinary fulfillment', () => {
  expect(isFullyRefundedRewardSale({ status: 'cancelled', totalCentavos: 0, chargedCentavos: 0, refundedCentavos: 0 }, 0)).toBe(true)
  expect(isFullyRefundedRewardSale({ status: 'confirmed', totalCentavos: 0, chargedCentavos: 0, refundedCentavos: 0 }, 0)).toBe(false)
  expect(isFullyRefundedRewardSale({ status: 'cancelled', totalCentavos: 0, chargedCentavos: 5000, refundedCentavos: 0 }, 0)).toBe(false)
})
