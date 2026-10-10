/**
 * Reads behind the superadmin Onboarding funnel. Server-only, service role,
 * called only after the caller is verified as a superadmin. Bounded: the last
 * 90 days of set-ups, their (first-time) events, and each store's first order.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FunnelSetup } from './funnel'

export const FUNNEL_WINDOW_DAYS = 90
const MAX_SETUPS = 500
const ID_CHUNK = 100
/** The platform API returns at most 1000 rows per request, whatever `limit` says: page explicitly. */
const EVENT_PAGE_SIZE = 1000
/** First-order lookups run this many at a time (one tiny indexed query per store). */
const ORDER_LOOKUP_CONCURRENCY = 20
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface SetupRow {
  id: string
  tenant_id: string | null
  created_at: string
  checkout_leads: { business_name: string | null } | null
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))
}

async function readEvents(admin: SupabaseClient, ids: readonly string[]): Promise<Map<string, Map<string, string>>> {
  const byId = new Map<string, Map<string, string>>()
  for (const group of chunks(ids, ID_CHUNK)) {
    // Page past the API's 1000-row cap; a stable order keeps pages from overlapping.
    for (let from = 0; ; from += EVENT_PAGE_SIZE) {
      const { data, error } = await admin
        .from('onboarding_events')
        .select('onboarding_id, event, created_at')
        .in('onboarding_id', group)
        .order('created_at', { ascending: true })
        .order('onboarding_id', { ascending: true })
        .range(from, from + EVENT_PAGE_SIZE - 1)
      if (error) throw new Error(`Funnel events could not be read: ${error.message}`)
      const rows = (data ?? []) as Array<{ onboarding_id: string; event: string; created_at: string }>
      for (const row of rows) {
        const events = byId.get(row.onboarding_id) ?? new Map<string, string>()
        events.set(row.event, row.created_at)
        byId.set(row.onboarding_id, events)
      }
      if (rows.length < EVENT_PAGE_SIZE) break
    }
  }
  return byId
}

/**
 * One store's first real order: the earliest non-cancelled order at or after
 * `from` (the store's go-live, so a test order placed before opening never
 * counts). A per-store query, because one chunked query over many stores is
 * capped at 1000 rows and a few busy stores would starve the slower ones.
 */
async function readFirstOrderAt(admin: SupabaseClient, tenantId: string, from: string): Promise<string | null> {
  const { data, error } = await admin
    .from('orders')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', from)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw new Error(`First orders could not be read: ${error.message}`)
  return (data as Array<{ created_at: string }> | null)?.[0]?.created_at ?? null
}

export async function loadFunnelSetups(admin: SupabaseClient, nowMs: number = Date.now()): Promise<FunnelSetup[]> {
  const since = new Date(nowMs - FUNNEL_WINDOW_DAYS * MS_PER_DAY).toISOString()
  const { data, error } = await admin
    .from('store_onboardings')
    .select('id, tenant_id, created_at, checkout_leads(business_name)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_SETUPS)
  if (error) throw new Error(`Set-ups could not be read: ${error.message}`)
  const rows = (data ?? []) as unknown as SetupRow[]

  const events = await readEvents(admin, rows.map((row) => row.id))
  const firstOrders = new Map<string, string | null>()
  for (const group of chunks(rows, ORDER_LOOKUP_CONCURRENCY)) {
    await Promise.all(group.map(async (row) => {
      if (!row.tenant_id) return
      const live = events.get(row.id)?.get('live')
      firstOrders.set(row.id, await readFirstOrderAt(admin, row.tenant_id, live ?? since))
    }))
  }

  return rows.map((row) => ({
    id: row.id,
    businessName: row.checkout_leads?.business_name ?? 'Unnamed store',
    createdAt: row.created_at,
    events: events.get(row.id) ?? new Map<string, string>(),
    firstOrderAt: firstOrders.get(row.id) ?? null,
  }))
}
