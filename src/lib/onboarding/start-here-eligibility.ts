/**
 * Whether a store gets "Start here": it was set up through onboarding, its
 * build has stopped, and it is still in its first weeks. One indexed read,
 * request-cached, failing closed (no Start here) so the admin shell never
 * breaks on it.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/** Long enough for the whole path (four weeks) plus a slow start. */
export const START_HERE_WINDOW_DAYS = 60
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function isWithinStartWindow(createdAt: string, nowMs: number): boolean {
  const created = Date.parse(createdAt)
  return Number.isFinite(created) && nowMs - created <= START_HERE_WINDOW_DAYS * MS_PER_DAY
}

export const hasStartHere = cache(async (tenantId: string): Promise<boolean> => {
  try {
    const admin = createAdminClient() as unknown as SupabaseClient
    const { data, error } = await admin
      .from('store_onboardings')
      .select('status, created_at')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error || !data) return false
    const row = data as { status: string; created_at: string }
    const isBuilt = row.status === 'ready' || row.status === 'failed'
    return isBuilt && isWithinStartWindow(row.created_at, Date.now())
  } catch (error) {
    console.error('[start-here] eligibility read failed', error instanceof Error ? error.message : error)
    return false
  }
})
