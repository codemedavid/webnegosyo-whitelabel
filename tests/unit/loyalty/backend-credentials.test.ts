/** @jest-environment node */
jest.mock('server-only', () => ({}))
import type { SupabaseClient } from '@supabase/supabase-js'
import { projectLoyaltyReceipts } from '@/lib/loyalty/projection-worker'
import { reconcileLoyaltyRefunds } from '@/lib/loyalty/refund-reconciliation'
import { createConvexServerClient } from '@/lib/convex/server'

const mockMutation = jest.fn(async () => 'projected-order')
const mockQuery = jest.fn(async () => ({ status: 'confirmed', totalCentavos: 5000, chargedCentavos: 5000, refundedCentavos: 0 }))
jest.mock('@/lib/convex/server', () => ({ createConvexServerClient: jest.fn(() => ({ mutation: mockMutation, query: mockQuery })) }))
jest.mock('@/lib/customers-service', () => ({ createSupabaseCustomerStore: () => ({}), upsertCustomerFromOrder: async () => 'customer' }))
jest.mock('@/lib/customer-external-orders', () => ({ captureExternalOrderCustomer: async () => 'customer', createSupabaseExternalOrderLedger: () => ({}) }))
jest.mock('@/lib/loyalty/store', () => ({ createSupabaseLoyaltyDeps: () => ({}), loadLoyaltyOrderFact: async () => ({ status: 'confirmed' }) }))
jest.mock('@/lib/loyalty/apply', () => ({ earnLoyaltyForFact: async () => ({ action: 'none' }) }))

const id = '11111111-1111-4111-8111-111111111111'
function database(backend: 'convex' | 'platform', secretError = false) {
  const snapshot = { version: 1, earningPrograms: [], outletId: null, orderTypeId: id, orderTypeName: 'Pickup',
    items: [{ menuItemId: id, name: 'Coffee', quantity: 1, unitPriceCentavos: 10000, baseUnitPriceCentavos: 10000, subtotalCentavos: 10000, selectedOptions: [] }],
    totals: { subtotalCentavos: 10000, discountCentavos: 5000, grandTotalCentavos: 5000 },
    discount: { label: 'Reward', loyaltyProgramId: id, amountCentavos: 5000 }, paymentMethods: [{ id, name: 'Cash' }] }
  const rows: Record<string, unknown> = {
    tenants: { order_backend: backend, convex_deployment_url: 'https://tenant.convex.cloud' },
    tenant_secrets: { convex_deploy_key: 'protected-deploy-key' },
    loyalty_pos_quotes: { customer_key: 'phone:+639171234567' },
    loyalty_pos_settlements: { id, quote_id: id, cashier_id: id, total_centavos: 5000, settled_at: '2026-09-15T15:59:00Z', order_snapshot: snapshot,
      payment: { methodId: id, kind: 'cash', amountTenderedCentavos: 5000, changeCentavos: 0 } },
  }
  const filters: unknown[][] = []
  const from = jest.fn((table: string) => {
    const builder: Record<string, unknown> = {}
    builder.select = (columns: string) => {
      if (table === 'tenants' && columns.includes('convex_deploy_key')) throw new Error('column tenants.convex_deploy_key does not exist')
      return builder
    }
    builder.eq = (column: string, value: unknown) => { filters.push([table, column, value]); return builder }
    for (const method of ['maybeSingle', 'update', 'is', 'or']) builder[method] = () => builder
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table], error: table === 'tenant_secrets' && secretError ? { message: 'denied' } : null }).then(resolve)
    return builder
  })
  const rpc = jest.fn(async (name: string) => {
    if (name === 'claim_loyalty_pos_projections' || name === 'claim_loyalty_refund_checks') return { data: [{ id: 'job', tenant_id: id, settlement_id: id, external_order_id: 'order', order_backend: backend === 'convex' ? 'convex' : 'platform_supabase', lease_token: 'lease' }], error: null }
    if (name === 'project_loyalty_pos_receipt') return { data: id, error: null }
    if (name === 'read_loyalty_refund_evidence') return { data: { status: 'confirmed', totalCentavos: 5000, chargedCentavos: 5000, refundedCentavos: 0 }, error: null }
    return { data: true, error: null }
  })
  return { admin: { from, rpc } as unknown as SupabaseClient, from, filters }
}

beforeEach(() => jest.clearAllMocks())

it('projects and checks refunds on the platform without selecting removed tenant columns', async () => {
  const db = database('platform')
  expect((await projectLoyaltyReceipts(db.admin)).completed).toBe(1)
  expect((await reconcileLoyaltyRefunds(db.admin)).checked).toBe(1)
  expect(db.from).not.toHaveBeenCalledWith('tenant_secrets')
})

it('uses the job tenant protected deploy key for Convex projection and refund evidence', async () => {
  const db = database('convex')
  expect((await projectLoyaltyReceipts(db.admin)).completed).toBe(1)
  expect((await reconcileLoyaltyRefunds(db.admin)).checked).toBe(1)
  expect(createConvexServerClient).toHaveBeenCalledTimes(2)
  expect(createConvexServerClient).toHaveBeenCalledWith('https://tenant.convex.cloud', 'protected-deploy-key')
  expect(db.filters.filter(([table]) => table === 'tenant_secrets')).toEqual([
    ['tenant_secrets', 'tenant_id', id], ['tenant_secrets', 'tenant_id', id],
  ])
  expect(mockMutation).toHaveBeenCalledWith('loyalty:projectReceiptInternal', expect.objectContaining({ receipt: expect.objectContaining({ settledAt: '2026-09-15T15:59:00Z' }) }))
})

it('keeps jobs retryable when the protected credential lookup fails', async () => {
  const db = database('convex', true)
  expect((await projectLoyaltyReceipts(db.admin)).retried).toBe(1)
  expect((await reconcileLoyaltyRefunds(db.admin)).unconfirmed).toBe(1)
  expect(createConvexServerClient).not.toHaveBeenCalled()
})
