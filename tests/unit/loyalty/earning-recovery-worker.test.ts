/** @jest-environment node */
import { createEarningRecoveryDeps } from '@/lib/loyalty/earning-recovery-worker'
import { fetchOrderTrackingContext } from '@/lib/order-tracking-service'
import { loadLoyaltyOrderFact } from '@/lib/loyalty/store'
import type { SupabaseClient } from '@supabase/supabase-js'
jest.mock('@/lib/order-tracking-service', () => ({ fetchOrderTrackingContext: jest.fn() }))
jest.mock('@/lib/tracking-token', () => ({ generateTrackingToken: () => 'token' }))
jest.mock('@/lib/customer-lifecycle-sync', () => ({ syncOrderLifecycle: jest.fn().mockResolvedValue('updated') }))
jest.mock('@/lib/customer-lifecycle-store', () => ({ createSupabaseLifecycleDeps: () => ({}) }))
jest.mock('@/lib/loyalty/store', () => ({ loadLoyaltyOrderFact: jest.fn(), createSupabaseLoyaltyDeps: () => ({}) }))

it('does not use a later platform edit as the historical earning cutoff', async () => {
  jest.mocked(loadLoyaltyOrderFact).mockResolvedValueOnce({ orderedAt: '2026-09-01T00:00:00Z', completedAt: '2026-09-26T00:00:00Z' } as never)
  const deps = createEarningRecoveryDeps({} as SupabaseClient)
  expect(await deps.refreshSource({ tenantId: 'tenant', backend: 'platform_supabase', externalOrderId: 'order' })).toBe('2026-09-01T00:00:00Z')
})

it('keeps the same conservative cutoff on every replay of a legacy completion', async () => {
  jest.mocked(loadLoyaltyOrderFact)
    .mockResolvedValueOnce({ phoneE164: '+639171234567', completedAt: null } as never)
    .mockResolvedValueOnce({ phoneE164: '+639171234567', completedAt: '2026-09-26T00:00:00Z' } as never)
  jest.mocked(fetchOrderTrackingContext).mockResolvedValue({ data: {
    status: 'delivered', createdAt: '2026-09-01T00:00:00Z',
    loyaltyIdentity: { backend: 'convex', customerKey: 'phone:+639171234567', observedAt: '2026-09-26T00:00:00Z' },
  }, error: null } as never)
  const deps = createEarningRecoveryDeps({} as SupabaseClient)
  const ref = { tenantId: 'tenant', backend: 'convex' as const, externalOrderId: 'order' }
  expect(await deps.refreshSource(ref)).toBe('2026-09-01T00:00:00Z')
  expect(await deps.refreshSource(ref)).toBe('2026-09-01T00:00:00Z')
})
