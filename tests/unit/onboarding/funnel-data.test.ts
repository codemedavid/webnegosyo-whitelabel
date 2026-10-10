/** @jest-environment node */
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadFunnelSetups } from '@/lib/onboarding/funnel-data'

interface OrderCall { tenantId?: string; from?: string }

/** Minimal chainable fake: records filters, answers per table. */
function fakeAdmin(opts: { setups: unknown[]; events: unknown[]; ordersByTenant: Record<string, string | null> }) {
  const orderCalls: OrderCall[] = []
  const admin = {
    from(table: string) {
      const call: OrderCall = {}
      const q: Record<string, unknown> = {}
      const chain = () => q
      Object.assign(q, {
        select: chain, order: chain, neq: chain, in: chain, limit: async () => ({ data: opts.setups, error: null }),
        gte: (column: string, value: string) => { if (table === 'orders') call.from = value; return q },
        eq: (column: string, value: string) => { call.tenantId = value; return q },
      })
      if (table === 'store_onboardings') {
        q.gte = chain
        q.limit = async () => ({ data: opts.setups, error: null })
      }
      if (table === 'onboarding_events') {
        q.range = async (from: number) => ({ data: from === 0 ? opts.events : [], error: null })
      }
      if (table === 'orders') {
        q.limit = async () => {
          orderCalls.push(call)
          const at = opts.ordersByTenant[call.tenantId ?? '']
          return { data: at ? [{ created_at: at }] : [], error: null }
        }
      }
      return q
    },
  }
  return { admin: admin as unknown as SupabaseClient, orderCalls }
}

describe('loadFunnelSetups', () => {
  test('looks up each store\'s first order from its OWN go-live, so a busy store cannot starve a quiet one and a pre-live test order is ignored', async () => {
    const { admin, orderCalls } = fakeAdmin({
      setups: [
        { id: 's1', tenant_id: 't1', created_at: '2026-10-01T00:00:00Z', checkout_leads: { business_name: 'Busy' } },
        { id: 's2', tenant_id: 't2', created_at: '2026-10-02T00:00:00Z', checkout_leads: { business_name: 'Quiet' } },
        { id: 's3', tenant_id: null, created_at: '2026-10-03T00:00:00Z', checkout_leads: null },
      ],
      events: [
        { onboarding_id: 's1', event: 'live', created_at: '2026-10-05T00:00:00Z' },
        { onboarding_id: 's2', event: 'live', created_at: '2026-10-06T00:00:00Z' },
      ],
      ordersByTenant: { t1: '2026-10-05T01:00:00Z', t2: '2026-10-07T00:00:00Z' },
    })

    const setups = await loadFunnelSetups(admin, Date.parse('2026-10-10T00:00:00Z'))

    expect(setups.map((s) => s.firstOrderAt)).toEqual(['2026-10-05T01:00:00Z', '2026-10-07T00:00:00Z', null])
    expect(orderCalls).toEqual([
      { tenantId: 't1', from: '2026-10-05T00:00:00Z' },
      { tenantId: 't2', from: '2026-10-06T00:00:00Z' },
    ])
    expect(setups[2].businessName).toBe('Unnamed store')
  })

  test('a store with no orders after going live has no first order', async () => {
    const { admin } = fakeAdmin({
      setups: [{ id: 's1', tenant_id: 't1', created_at: '2026-10-01T00:00:00Z', checkout_leads: null }],
      events: [{ onboarding_id: 's1', event: 'live', created_at: '2026-10-05T00:00:00Z' }],
      ordersByTenant: { t1: null },
    })

    const [setup] = await loadFunnelSetups(admin, Date.parse('2026-10-10T00:00:00Z'))

    expect(setup.firstOrderAt).toBeNull()
  })
})
