import type { SupabaseClient } from '@supabase/supabase-js'
import type { LoyaltyActivityKind, LoyaltyActivityPage } from './activity'
import { describeLoyaltyReward } from './offer'
import { parseLoyaltyRules } from './rules'

export interface ActivityFilters {
  limit: number
  kind?: LoyaltyActivityKind
  customerKey?: string
  programId?: string
  outletId?: string
  from?: string
  to?: string
  cursor?: string
}

/** Timestamp + UUID gives stable pagination when many events share a timestamp. */
export async function readLoyaltyActivity(client: SupabaseClient, tenantId: string, filters: ActivityFilters): Promise<LoyaltyActivityPage> {
  let query = client.from('loyalty_activity')
    .select('id,kind,occurred_at,customer_key,program_id,program_name,delta,reward_id,reward_terms,previous_status,status,order_backend,external_order_id,outlet_id,actor_id,note')
    .eq('tenant_id', tenantId)
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.customerKey) query = query.eq('customer_key', filters.customerKey)
  if (filters.programId) query = query.eq('program_id', filters.programId)
  if (filters.outletId) query = query.eq('outlet_id', filters.outletId)
  if (filters.from) query = query.gte('occurred_at', filters.from)
  if (filters.to) query = query.lt('occurred_at', filters.to)
  if (filters.cursor) {
    const [at, id] = filters.cursor.split('|')
    // Both parts are validated at the HTTP boundary before reaching PostgREST.
    query = query.or(`occurred_at.lt.${at},and(occurred_at.eq.${at},id.lt.${id})`)
  }
  const { data, error } = await query.order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(filters.limit + 1)
  if (error) throw new Error('Loyalty activity could not be loaded')
  const rows = (data ?? []) as Array<Record<string, unknown>>
  const page = rows.slice(0, filters.limit)
  const actorIds = [...new Set(page.map(row => row.actor_id).filter((id): id is string => typeof id === 'string'))]
  const names = new Map<string, string>()
  if (actorIds.length) {
    const { data: staff, error: staffError } = await client.from('app_users').select('user_id,display_name')
      .eq('tenant_id', tenantId).in('user_id', actorIds)
    if (!staffError) for (const actor of staff ?? []) if (actor.display_name) names.set(actor.user_id, actor.display_name)
  }
  const events = page.map(row => {
    const terms = row.reward_terms as { reward?: unknown } | null
    const rules = parseLoyaltyRules({ earnMode: 'stamp', threshold: 1, reward: terms?.reward })
    const nullable = (value: unknown) => typeof value === 'string' ? value : null
    return {
      id: String(row.id), kind: row.kind as LoyaltyActivityKind, occurredAt: String(row.occurred_at),
      customerKey: String(row.customer_key), programId: String(row.program_id), programName: String(row.program_name),
      delta: row.delta === null ? null : Number(row.delta), rewardId: nullable(row.reward_id),
      rewardLabel: rules.ok ? describeLoyaltyReward(rules.value.reward) : null,
      previousStatus: nullable(row.previous_status), status: nullable(row.status),
      orderBackend: nullable(row.order_backend), orderId: nullable(row.external_order_id),
      outletId: nullable(row.outlet_id), actorId: nullable(row.actor_id), note: nullable(row.note),
      actorName: names.get(String(row.actor_id)) ?? null,
    }
  })
  const last = page.at(-1)
  return { events, nextCursor: rows.length > filters.limit && last ? `${last.occurred_at}|${last.id}` : null }
}
