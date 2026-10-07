/**
 * Platform-side customer signals the Growth tab needs beside the sales:
 * stamp-card start dates (who is a Member), the reachable SMS audience, and
 * the loyalty "ready to act" counts. All three live on the platform database
 * whatever the store's order backend.
 *
 * Each read degrades on its own: a failure yields null plus a note, so one
 * missing table never blanks the whole tab.
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listLoyaltyMembers } from '@/lib/loyalty/member-repository'
import { DAY_MS } from './periods'

const PAGE_SIZE = 1000
const MAX_CARD_ROWS = 50_000
const PHONE_KEY_PREFIX = 'phone:'
const JOINED_WINDOW_DAYS = 7

export interface ReachableAudience {
  reachable: number
  joinedThisWeek: number
}

export interface LoyaltyActions {
  members: number
  rewardReady: number
  almostThere: number
  dormant: number
}

export interface CustomerSignals {
  cardsSince: Record<string, number>
  reachable: ReachableAudience | null
  loyalty: LoyaltyActions | null
  notes: string[]
}

async function readCardsSince(
  client: SupabaseClient,
  tenantId: string,
): Promise<{ cards: Record<string, number>; note: string | null }> {
  const cards: Record<string, number> = {}
  for (let from = 0; from < MAX_CARD_ROWS; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('loyalty_balances')
      .select('customer_key, created_at')
      .eq('tenant_id', tenantId)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { cards: {}, note: `Stamp cards could not be read, so Members show as Regulars (${error.message}).` }

    for (const row of (data ?? []) as Array<{ customer_key: string | null; created_at: string }>) {
      if (!row.customer_key?.startsWith(PHONE_KEY_PREFIX)) continue
      const phone = row.customer_key.slice(PHONE_KEY_PREFIX.length)
      const since = Date.parse(row.created_at)
      if (Number.isNaN(since)) continue
      cards[phone] = Math.min(cards[phone] ?? Number.POSITIVE_INFINITY, since)
    }
    if ((data?.length ?? 0) < PAGE_SIZE) break
  }
  return { cards, note: null }
}

async function readReachable(client: SupabaseClient, tenantId: string, now: number): Promise<ReachableAudience | null> {
  const base = () =>
    client
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('sms_consent', true)
      .not('sms_opt_out', 'is', true)

  const [all, recent] = await Promise.all([
    base(),
    base().gte('sms_consent_at', new Date(now - JOINED_WINDOW_DAYS * DAY_MS).toISOString()),
  ])
  if (all.error || recent.error) return null
  return { reachable: all.count ?? 0, joinedThisWeek: recent.count ?? 0 }
}

async function readLoyaltyActions(client: SupabaseClient, tenantId: string): Promise<LoyaltyActions | null> {
  const programs = await client
    .from('loyalty_programs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
  if (programs.error || !programs.count) return null

  const { totals } = await listLoyaltyMembers(client, tenantId, { limit: 1 })
  return {
    members: totals.total,
    rewardReady: totals.rewardReady,
    almostThere: totals.almostThere,
    dormant: totals.dormant,
  }
}

export async function readCustomerSignals(
  client: SupabaseClient,
  tenantId: string,
  now: number,
): Promise<CustomerSignals> {
  const [cards, reachable, loyalty] = await Promise.all([
    readCardsSince(client, tenantId),
    readReachable(client, tenantId, now).catch(() => null),
    readLoyaltyActions(client, tenantId).catch(() => null),
  ])
  return {
    cardsSince: cards.cards,
    reachable,
    loyalty,
    notes: cards.note ? [cards.note] : [],
  }
}
