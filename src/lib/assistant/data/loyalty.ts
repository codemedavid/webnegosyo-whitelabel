/**
 * The store's loyalty picture for the assistant: programs with their rules,
 * member standing, and the last 30 days of activity. Service role, read AFTER
 * the route authorised the caller (the loyalty tables are not readable to
 * admins under RLS by design — the web routes read them the same way).
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { listLoyaltyPrograms, type LoyaltyProgramSummary } from '@/lib/loyalty/repository'
import { listLoyaltyMembers } from '@/lib/loyalty/member-repository'
import type { LoyaltyMember, LoyaltyMemberTotals } from '@/lib/loyalty/members'

const ACTIVITY_DAYS = 30
const DAY_MS = 86_400_000
const NEAR_REWARD_LIMIT = 5

export interface LoyaltyActivityCounts {
  earningVisits: number
  rewardsIssued: number
  rewardsRedeemed: number
}

export interface AssistantLoyalty {
  isLive: boolean
  programs: LoyaltyProgramSummary[]
  totals: LoyaltyMemberTotals | null
  nearReward: LoyaltyMember[]
  last30Days: LoyaltyActivityCounts | null
}

async function countActivity(client: SupabaseClient, tenantId: string, kind: string, since: string): Promise<number> {
  const { count, error } = await client
    .from('loyalty_activity')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .gte('occurred_at', since)
  if (error) throw new Error(`loyalty activity unreadable: ${error.message}`)
  return count ?? 0
}

async function readActivity(client: SupabaseClient, tenantId: string, now: number): Promise<LoyaltyActivityCounts | null> {
  const since = new Date(now - ACTIVITY_DAYS * DAY_MS).toISOString()
  try {
    const [earningVisits, rewardsIssued, rewardsRedeemed] = await Promise.all([
      countActivity(client, tenantId, 'earn', since),
      countActivity(client, tenantId, 'reward_issued', since),
      countActivity(client, tenantId, 'reward_consumed', since),
    ])
    return { earningVisits, rewardsIssued, rewardsRedeemed }
  } catch (error) {
    console.error('[assistant] loyalty activity unavailable', { tenantId, message: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export async function readAssistantLoyalty(tenantId: string, now = Date.now()): Promise<AssistantLoyalty> {
  const client = createAdminClient() as unknown as SupabaseClient
  const [tenant, programs] = await Promise.all([
    client.from('tenants').select('loyalty_enabled, loyalty_shadow').eq('id', tenantId).maybeSingle(),
    listLoyaltyPrograms(client, tenantId),
  ])
  const flags = tenant.data as { loyalty_enabled?: boolean | null; loyalty_shadow?: boolean | null } | null
  // A flag that cannot be read is shadow, never live (tenant-flags.ts).
  const isLive = flags?.loyalty_enabled === true && flags?.loyalty_shadow === false
  if (programs.length === 0) return { isLive, programs, totals: null, nearReward: [], last30Days: null }

  const [members, last30Days] = await Promise.all([
    listLoyaltyMembers(client, tenantId, { limit: NEAR_REWARD_LIMIT, nowMs: now }).catch((error: unknown) => {
      console.error('[assistant] loyalty members unavailable', { tenantId, message: error instanceof Error ? error.message : String(error) })
      return null
    }),
    readActivity(client, tenantId, now),
  ])
  return {
    isLive,
    programs,
    totals: members?.totals ?? null,
    nearReward: (members?.members ?? []).filter((m) => m.status === 'reward_ready' || m.status === 'almost_there'),
    last30Days,
  }
}
