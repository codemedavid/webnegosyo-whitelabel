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
const MAX_EVENT_ROWS = 5000
/** Earliest orders across the window's stores; a store's first one is always among them in practice. */
const MAX_ORDER_ROWS = 3000
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
    const { data, error } = await admin.from('onboarding_events').select('onboarding_id, event, created_at').in('onboarding_id', group).limit(MAX_EVENT_ROWS)
    if (error) throw new Error(`Funnel events could not be read: ${error.message}`)
    for (const row of (data ?? []) as Array<{ onboarding_id: string; event: string; created_at: string }>) {
      const events = byId.get(row.onboarding_id) ?? new Map<string, string>()
      events.set(row.event, row.created_at)
      byId.set(row.onboarding_id, events)
    }
  }
  return byId
}

async function readFirstOrders(admin: SupabaseClient, tenantIds: readonly string[], since: string): Promise<Map<string, string>> {
  const first = new Map<string, string>()
  for (const group of chunks(tenantIds, ID_CHUNK)) {
    const { data, error } = await admin
      .from('orders')
      .select('tenant_id, created_at')
      .in('tenant_id', group)
      .gte('created_at', since)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .limit(MAX_ORDER_ROWS)
    if (error) throw new Error(`First orders could not be read: ${error.message}`)
    for (const row of (data ?? []) as Array<{ tenant_id: string; created_at: string }>) {
      if (!first.has(row.tenant_id)) first.set(row.tenant_id, row.created_at)
    }
  }
  return first
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

  const tenantIds = rows.flatMap((row) => (row.tenant_id ? [row.tenant_id] : []))
  const [events, firstOrders] = await Promise.all([
    readEvents(admin, rows.map((row) => row.id)),
    readFirstOrders(admin, tenantIds, since),
  ])

  return rows.map((row) => {
    const setupEvents = events.get(row.id) ?? new Map<string, string>()
    const live = setupEvents.get('live')
    const firstOrder = row.tenant_id ? firstOrders.get(row.tenant_id) ?? null : null
    return {
      id: row.id,
      businessName: row.checkout_leads?.business_name ?? 'Unnamed store',
      createdAt: row.created_at,
      events: setupEvents,
      // Only an order after the store opened counts as its first real order.
      firstOrderAt: firstOrder && (!live || firstOrder >= live) ? firstOrder : null,
    }
  })
}
