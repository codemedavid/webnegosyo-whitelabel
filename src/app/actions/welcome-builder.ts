'use server'

import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { invalidateTenantCache } from '@/lib/cache'
import { LIMITS } from '@/lib/hero-builder/constants'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'
import { entryProblem } from '@/lib/welcome-builder/entry'

interface WelcomeActionResult {
  success: boolean
  error?: string
}

const ACCESS_REFUSED = /^(Unauthorized|Forbidden):/

/** Merchant-facing text: access refusals read as what to do, not as an auth trace. */
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'An unexpected error occurred'
  if (error.message === 'Unauthorized: Not authenticated') return 'Your session has ended. Sign in again, then publish.'
  if (ACCESS_REFUSED.test(error.message)) return 'Your account can’t change the welcome page. Ask the store owner for Store setup access.'
  return error.message
}

/**
 * Refresh every cached copy of the tenant row. The slug comes from the row the
 * update touched, never from the browser, so a forged slug cannot aim a purge.
 */
async function refreshStorefront(slug: string, tenantId: string): Promise<void> {
  await invalidateTenantCache(slug, tenantId)
  revalidateStorefrontMenu(slug)
}

/**
 * Publish a Welcome Builder design: validate it with the Hero Builder's v5
 * schema, insist it offers a way to start ordering on every device, store it
 * (TEXT, like hero_design) and switch the custom welcome page on.
 */
export async function publishWelcomeDesignAction(tenantId: string, design: unknown): Promise<WelcomeActionResult> {
  try {
    await verifyTenantPermission(tenantId, 'store_setup')

    const parsed = heroDesignV5Schema.safeParse(design)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue?.path?.length ? ` (${issue.path.join('.')})` : ''
      return { success: false, error: `${issue?.message ?? 'Invalid design'}${where}` }
    }
    if (parsed.data.sections.length === 0) {
      return { success: false, error: 'Add at least one section before publishing.' }
    }
    const missingEntry = entryProblem(parsed.data)
    if (missingEntry) return { success: false, error: missingEntry }

    const serialized = JSON.stringify(parsed.data)
    if (serialized.length > LIMITS.designBytes) {
      return { success: false, error: 'This design is too large. Remove some elements or shorten custom code.' }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tenants')
      .update({ welcome_design: serialized, welcome_design_enabled: true })
      .eq('id', tenantId)
      .select('id, slug')
      .single()

    // RLS refusals come back as "no row", not as an error — treat both alike.
    if (error || !data) {
      console.error('[publishWelcomeDesignAction] Database error:', error)
      return { success: false, error: 'Could not publish the welcome page. Please try again.' }
    }

    await refreshStorefront(data.slug, tenantId)
    return { success: true }
  } catch (error) {
    console.error('[publishWelcomeDesignAction] Error:', error)
    return { success: false, error: errorMessage(error) }
  }
}

/** Switch back to the classic welcome screen; the design is kept for later. */
export async function unpublishWelcomeDesignAction(tenantId: string): Promise<WelcomeActionResult> {
  try {
    await verifyTenantPermission(tenantId, 'store_setup')
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tenants')
      .update({ welcome_design_enabled: false })
      .eq('id', tenantId)
      .select('id, slug')
      .single()
    if (error || !data) {
      console.error('[unpublishWelcomeDesignAction] Database error:', error)
      return { success: false, error: 'Could not update the storefront. Please try again.' }
    }
    await refreshStorefront(data.slug, tenantId)
    return { success: true }
  } catch (error) {
    console.error('[unpublishWelcomeDesignAction] Error:', error)
    return { success: false, error: errorMessage(error) }
  }
}
