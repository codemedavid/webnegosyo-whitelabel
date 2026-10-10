'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { getRequestCaller } from '@/lib/auth/request-caller'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPathStepId } from '@/lib/onboarding/start-path'

export type StartHereResult = { success: true } | { success: false; error: string }

/**
 * The owner ticks (or unticks) a Start-here step by hand. Any step id from the
 * path is accepted, but the path only counts a hand tick for a step that is
 * manual or whose data could not be read (`canTickByHand`), so a tick can
 * never mark "first order" done on a store whose orders say otherwise.
 */
export async function setStartStepTickAction(
  tenantId: string,
  tenantSlug: string,
  stepId: string,
  isDone: boolean,
): Promise<StartHereResult> {
  if (!isPathStepId(stepId)) return { success: false, error: 'Unknown step.' }
  try {
    const { userRole } = await verifyTenantAdmin(tenantId, 'view')
    // The path is store-wide progress: a branch-locked account must not move it.
    if (userRole.outlet_id) return { success: false, error: 'Only store-wide accounts can change this.' }
    const { user } = await getRequestCaller()
    const admin = createAdminClient()
    // The generated types predate this table.
    const ticks = (admin as unknown as SupabaseClient).from('owner_path_ticks')
    const { error } = isDone
      ? await ticks.upsert({ tenant_id: tenantId, step_id: stepId, ticked_by: user?.id ?? null }, { onConflict: 'tenant_id,step_id' })
      : await ticks.delete().eq('tenant_id', tenantId).eq('step_id', stepId)
    if (error) throw new Error(error.message)
    revalidatePath(`/${tenantSlug}/admin/start`)
    return { success: true }
  } catch (error) {
    console.error('[start-here] tick failed', { tenantId, stepId, error: error instanceof Error ? error.message : error })
    const message = error instanceof Error && error.message.startsWith('Unauthorized') ? 'You do not have access to this store.' : 'That did not save. Please try again.'
    return { success: false, error: message }
  }
}
