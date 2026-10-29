import 'server-only'

import { resolveStaffLimit } from '@/lib/billing/subscription-status'
import { createClient } from '@/lib/supabase/server'

/**
 * The seats per branch this tenant's plan includes, for screens that SHOW the
 * allowance. Enforcement reads the column itself (staff actions, manage-staff,
 * the `enforce_staff_limit` trigger); this only keeps the labels and the Add
 * button in step with it. A failed read falls back to the platform default,
 * never to unlimited.
 */
export async function loadStaffSeatLimit(tenantId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('max_staff_per_branch')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) {
    console.error('[staff-seats] could not read the seat allowance:', error.message)
  }
  return resolveStaffLimit({
    max_staff_per_branch: (data as { max_staff_per_branch?: number | null } | null)?.max_staff_per_branch ?? null,
  })
}
