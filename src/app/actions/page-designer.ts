'use server'

import { z } from 'zod'

import { verifyTenantPermission } from '@/lib/admin-service'
import { invalidateTenantCache } from '@/lib/cache'
import { LIMITS } from '@/lib/hero-builder/constants'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { PAGE_DESIGN_COLUMNS, REDIRECT_SECONDS } from '@/lib/page-designer/page-mode'
import { isPageId } from '@/lib/page-designer/pages'
import { pageDesignProblem } from '@/lib/page-designer/rules'
import { createClient } from '@/lib/supabase/server'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'

interface PageDesignerActionResult {
  success: boolean
  error?: string
}

const ACCESS_REFUSED = /^(Unauthorized|Forbidden):/

/** Merchant-facing text: access refusals read as what to do, not as an auth trace. */
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'An unexpected error occurred'
  if (error.message === 'Unauthorized: Not authenticated') return 'Your session has ended. Sign in again, then publish.'
  if (ACCESS_REFUSED.test(error.message)) return 'Your account can’t change these pages. Ask the store owner for Store setup access.'
  return error.message
}

/** The slug comes from the row the update touched, never from the browser. */
async function refreshStorefront(slug: string, tenantId: string): Promise<void> {
  await invalidateTenantCache(slug, tenantId)
  revalidateStorefrontMenu(slug)
}

type Update = Record<string, string | boolean | number>

/** One tenants UPDATE through the caller's session; RLS refusals come back as "no row". */
async function writeTenant(tenantId: string, update: Update, label: string): Promise<PageDesignerActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    // Column names are picked per page (PAGE_DESIGN_COLUMNS), so the generated row type can't see them.
    .update(update as never)
    .eq('id', tenantId)
    .select('id, slug')
    .single()
  if (error || !data) {
    console.error(`[${label}] Database error:`, error)
    return { success: false, error: 'Could not save. Please try again.' }
  }
  await refreshStorefront(data.slug, tenantId)
  return { success: true }
}

/**
 * Publish a Page Designer design for one page: the Hero Builder v5 schema,
 * then the page's own rules (known blocks only, each once, required blocks
 * visible on every device, only the elements this page offers), then store it
 * (TEXT) and switch the designed page on.
 */
export async function publishPageDesignAction(tenantId: string, page: unknown, design: unknown): Promise<PageDesignerActionResult> {
  try {
    if (!isPageId(page)) return { success: false, error: 'Unknown page' }
    await verifyTenantPermission(tenantId, 'store_setup')

    const parsed = heroDesignV5Schema.safeParse(design)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue?.path?.length ? ` (${issue.path.join('.')})` : ''
      return { success: false, error: `${issue?.message ?? 'Invalid design'}${where}` }
    }
    if (parsed.data.sections.length === 0) return { success: false, error: 'Add at least one section before publishing.' }
    const problem = pageDesignProblem(parsed.data, page)
    if (problem) return { success: false, error: problem }

    const serialized = JSON.stringify(parsed.data)
    // Bytes, not characters: emoji and accented text count more than once in the column.
    if (Buffer.byteLength(serialized, 'utf8') > LIMITS.designBytes) {
      return { success: false, error: 'This design is too large. Remove some elements or shorten custom code.' }
    }

    const columns = PAGE_DESIGN_COLUMNS[page]
    return await writeTenant(tenantId, { [columns.design]: serialized, [columns.enabled]: true }, 'publishPageDesignAction')
  } catch (error) {
    console.error('[publishPageDesignAction] Error:', error)
    return { success: false, error: errorMessage(error) }
  }
}

/** Back to the standard page; the design is kept for later. */
export async function unpublishPageDesignAction(tenantId: string, page: unknown): Promise<PageDesignerActionResult> {
  try {
    if (!isPageId(page)) return { success: false, error: 'Unknown page' }
    await verifyTenantPermission(tenantId, 'store_setup')
    return await writeTenant(tenantId, { [PAGE_DESIGN_COLUMNS[page].enabled]: false }, 'unpublishPageDesignAction')
  } catch (error) {
    console.error('[unpublishPageDesignAction] Error:', error)
    return { success: false, error: errorMessage(error) }
  }
}

const redirectSchema = z
  .object({
    mode: z.enum(['instant', 'countdown', 'stay']),
    seconds: z.number().int().min(REDIRECT_SECONDS.min).max(REDIRECT_SECONDS.max),
  })
  .strict()

/** How the thank-you page hands over to tracking (instant, after a countdown, or stay). */
export async function saveConfirmationRedirectAction(tenantId: string, setting: unknown): Promise<PageDesignerActionResult> {
  try {
    const parsed = redirectSchema.safeParse(setting)
    if (!parsed.success) {
      return { success: false, error: `Pick between ${REDIRECT_SECONDS.min} and ${REDIRECT_SECONDS.max} seconds.` }
    }
    await verifyTenantPermission(tenantId, 'store_setup')
    return await writeTenant(
      tenantId,
      { confirmation_redirect: parsed.data.mode, confirmation_redirect_seconds: parsed.data.seconds },
      'saveConfirmationRedirectAction',
    )
  } catch (error) {
    console.error('[saveConfirmationRedirectAction] Error:', error)
    return { success: false, error: errorMessage(error) }
  }
}

