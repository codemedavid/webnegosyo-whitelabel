import 'server-only'

/**
 * The reads behind Settings → Tax & discounts.
 *
 * The profile and its change log go through the viewer's own session, so RLS
 * decides what they see (any store account reads the profile; only the owner
 * reads the log). Two lookups need the service role because their tables are
 * closed to every signed-in role: the changer's name (`app_users` is
 * self-read only) and whether the viewer already has an approval PIN
 * (`staff_approval_pins` is service-role only). Both are asked about ONE
 * known user, after the page's own gate has run.
 */

import { TAX_PROFILE_COLUMNS, taxProfileFromRow, type TaxProfile } from '@/lib/gov-discount'
import { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { TaxProfileLastChange } from './last-change'

export type TaxProfileRead =
  | { status: 'ok'; profile: TaxProfile | null; updatedAt: string | null }
  /** Unreadable is NOT "not set up": the page must not offer a blank form over a real profile. */
  | { status: 'error' }

function logReadError(context: string, error: unknown): void {
  console.error(`[tax-settings] ${context}:`, error instanceof Error ? error.message : error)
}

export async function readStoreTaxProfile(tenantId: string): Promise<TaxProfileRead> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('store_tax_profiles')
      .select(`${TAX_PROFILE_COLUMNS}, updated_at`)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error) {
      logReadError('profile read failed', error.message)
      return { status: 'error' }
    }
    if (!data) return { status: 'ok', profile: null, updatedAt: null }

    const profile = taxProfileFromRow(data)
    if (!profile) return { status: 'error' }
    const updatedAt = (data as { updated_at?: string | null }).updated_at ?? null
    return { status: 'ok', profile, updatedAt }
  } catch (error) {
    logReadError('profile read threw', error)
    return { status: 'error' }
  }
}

async function readChangerName(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const { data, error } = await admin
      .from('app_users')
      .select('display_name, email')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return data.display_name?.trim() || data.email || null
  } catch (error) {
    logReadError('changer name lookup threw', error)
    return null
  }
}

/** The newest logged change — owner-readable only. Null when unreadable or absent. */
export async function readLastTaxProfileChange(tenantId: string): Promise<TaxProfileLastChange | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('store_tax_profile_changes')
      .select('changed_by, changed_at')
      .eq('tenant_id', tenantId)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      logReadError('change log read failed', error.message)
      return null
    }
    if (!data) return null

    const changerName = data.changed_by ? await readChangerName(data.changed_by) : null
    return { changedAt: data.changed_at, changedBy: data.changed_by, changerName }
  } catch (error) {
    logReadError('change log read threw', error)
    return null
  }
}

/** Whether this person already set an approval PIN here. Null when it could not be checked. */
export async function readHasApprovalPin(tenantId: string, userId: string): Promise<boolean | null> {
  try {
    const admin = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS })
    const { data, error } = await admin
      .from('staff_approval_pins')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      logReadError('pin lookup failed', error.message)
      return null
    }
    return data !== null
  } catch (error) {
    logReadError('pin lookup threw', error)
    return null
  }
}
