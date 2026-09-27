import type { SupabaseClient } from '@supabase/supabase-js'
import { readLoyaltyActivity } from '@/lib/loyalty/activity-repository'

it('shows the staff name with safe claim details and keeps both reads tenant-scoped', async () => {
  const filters: Record<string, Record<string, unknown>> = {}
  const data = {
    loyalty_activity: [{ id: 'event', kind: 'reward_consumed', tenant_id: 'tenant', customer_key: 'phone:+639171234567', program_id: 'program', program_name: 'Coffee', actor_id: 'staff', occurred_at: '2026-09-26T01:00:00Z', delta: null, reward_terms: { reward: { type: 'fixed', amount: 100 } }, token: 'never-return', status: 'consumed', external_order_id: 'order' }],
    app_users: [{ user_id: 'staff', display_name: 'Ana', tenant_id: 'tenant', email: 'private@example.test' }],
  }
  const client = { from: (table: keyof typeof data) => {
    filters[table] = {}
    const builder = { select: () => builder, eq: (key: string, value: unknown) => { filters[table][key] = value; return builder }, in: () => builder,
      order: () => builder, limit: () => builder, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data[table], error: null }).then(resolve) }
    return builder
  } } as unknown as SupabaseClient
  const page = await readLoyaltyActivity(client, 'tenant', { limit: 30 })
  expect(page.events[0]).toMatchObject({ actorName: 'Ana', rewardLabel: '₱100 off', orderId: 'order' })
  expect(JSON.stringify(page)).not.toMatch(/never-return|private@example/)
  expect(filters.loyalty_activity.tenant_id).toBe('tenant')
  expect(filters.app_users.tenant_id).toBe('tenant')
})
