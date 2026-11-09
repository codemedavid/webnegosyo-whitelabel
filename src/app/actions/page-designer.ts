'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { verifyTenantPermission } from '@/lib/admin-service'
import { saveBrandingWithClient } from '@/lib/branding-write'
import type { BrandingPatchInput } from '@/lib/branding-service'
import { invalidateTenantCache } from '@/lib/cache'
import { LIMITS } from '@/lib/hero-builder/constants'
import { heroDesignV5Schema } from '@/lib/hero-builder/schema'
import { PAGE_DESIGN_COLUMNS, REDIRECT_SECONDS } from '@/lib/page-designer/page-mode'
import { isPageLookField, lookConflicts, lookPatch, PAGE_LOOK_SECTIONS } from '@/lib/page-designer/look'
import { isPageId } from '@/lib/page-designer/pages'
import type { PageId } from '@/lib/page-designer/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { pageDesignProblem } from '@/lib/page-designer/rules'
import { createClient } from '@/lib/supabase/server'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'
import type { FormSaveOutcome } from '@/lib/page-designer/form-changes'
import { saveCheckoutForm } from '@/lib/page-designer/form-save'
import { readTenantSlugById } from '@/lib/tenant-revalidation'

interface PageDesignerActionResult {
  success: boolean
  error?: string
}

/** A result that may carry the saved checkout questions (with the ids new ones were given). */
interface PageDesignerFormResult extends PageDesignerActionResult {
  form?: FormSaveOutcome
}

const ACCESS_REFUSED = /^(Unauthorized|Forbidden):/

/** Merchant-facing text: access refusals read as what to do, not as an auth trace. */
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'An unexpected error occurred'
  if (error.message === 'Unauthorized: Not authenticated') return 'Your session has ended. Sign in again, then publish.'
  if (ACCESS_REFUSED.test(error.message)) return 'Your account can’t change these pages. Ask the store owner for Store setup access.'
  return error.message
}

/**
 * The slug comes from the row the update touched, never from the browser. The
 * write has landed by now: a cache hiccup must not read as a failed publish.
 */
async function refreshStorefront(slug: string, tenantId: string): Promise<void> {
  try {
    await invalidateTenantCache(slug, tenantId)
    revalidateStorefrontMenu(slug)
  } catch (error) {
    console.error('[refreshStorefront] Could not refresh the storefront:', error)
  }
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

const LOOK_FIELD_ID = /^[a-z0-9_]{1,64}(\.[a-z0-9_]{1,64})?$/
const lookValue = z.union([z.string().max(500), z.boolean()])

const lookSchema = z
  .object({
    changes: z.record(z.string().regex(LOOK_FIELD_ID), lookValue),
    /** The saved values the editor started from, for the changed fields only. */
    base: z.record(z.string().regex(LOOK_FIELD_ID), z.union([lookValue, z.null()])),
  })
  .strict()
  .refine((look) => Object.keys(look.changes).length <= 200, 'Too many changes')

function lookFieldLabel(page: PageId, fieldId: string): string {
  for (const section of PAGE_LOOK_SECTIONS[page]) {
    const field = section.fields.find((f) => f.id === fieldId)
    if (field) return `${section.title} → ${field.label}`
  }
  return fieldId
}

/**
 * Save the page's Look (the Branding Studio colours and wording it uses)
 * through the Studio's own validation. Only fields the page's Look tab shows
 * may change. Refused when one of them was saved elsewhere (the Studio)
 * since the editor opened, so neither editor silently overwrites the other.
 * Caller has passed `store_setup`.
 */
async function writePageLook(tenantId: string, page: PageId, input: unknown): Promise<PageDesignerActionResult> {
  const parsed = lookSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Those colours could not be read. Reload the page and try again.' }
  const { changes, base } = parsed.data
  const ids = Object.keys(changes)
  if (!ids.length) return { success: true }
  if (ids.some((id) => !isPageLookField(page, id))) return { success: false, error: 'That setting is not part of this page. Reload and try again.' }

  const supabase = await createClient()
  // Column names come from the allowlist above, never straight from the browser.
  const columns = [...new Set(ids.map((id) => id.split('.')[0]))]
  const { data: current, error } = await supabase.from('tenants').select(['id', ...columns].join(', ')).eq('id', tenantId).maybeSingle()
  if (error || !current) {
    console.error('[writePageLook] Could not read the current look:', error)
    return { success: false, error: 'Could not save the colours. Please try again.' }
  }
  const row = current as unknown as Record<string, unknown>
  const moved = lookConflicts(changes, base, row)
  if (moved.length) {
    const names = moved.slice(0, 3).map((id) => `"${lookFieldLabel(page, id)}"`).join(', ')
    return { success: false, error: `${names} changed in Branding Studio since you opened this page. Reload to see it, then make your change again.` }
  }
  const result = await saveBrandingWithClient(supabase, tenantId, lookPatch(changes, row) as BrandingPatchInput, createAdminClient())
  return result.success ? { success: true } : { success: false, error: result.error ?? 'Could not save the colours.' }
}

/** Save only the page's Look (it also shows on the standard page and in Branding Studio). */
export async function savePageLookAction(tenantId: string, page: unknown, look: unknown): Promise<PageDesignerActionResult> {
  try {
    if (!isPageId(page)) return { success: false, error: 'Unknown page' }
    await verifyTenantPermission(tenantId, 'store_setup')
    return await writePageLook(tenantId, page, look)
  } catch (error) {
    console.error('[savePageLookAction] Error:', error)
    return { success: false, error: errorMessage(error) }
  }
}

/**
 * Save the checkout questions (every order type's `customer_form_fields`):
 * the same rows the standard checkout, the Order types page and the register
 * read. Caller has passed `store_setup`; each write checks it again.
 */
async function writeCheckoutForm(tenantId: string, input: unknown): Promise<PageDesignerFormResult> {
  const result = await saveCheckoutForm(tenantId, input)
  // Nothing written at all: nothing to refresh.
  if (!result.success && !result.outcome) return { success: false, error: result.error }
  const slug = await readTenantSlugById(await createClient(), tenantId)
  if (slug) {
    revalidatePath(`/${slug}/checkout`)
    revalidatePath(`/${slug}/admin/order-types`, 'layout')
  }
  return result.success ? { success: true, form: result.outcome } : { success: false, error: result.error, form: result.outcome }
}

/** Save only the checkout questions (they also show on the standard checkout and the register). */
export async function saveCheckoutFormAction(tenantId: string, form: unknown): Promise<PageDesignerFormResult> {
  try {
    await verifyTenantPermission(tenantId, 'store_setup')
    return await writeCheckoutForm(tenantId, form)
  } catch (error) {
    console.error('[saveCheckoutFormAction] Error:', error)
    return { success: false, error: errorMessage(error) }
  }
}

/**
 * Publish a Page Designer design for one page: the Hero Builder v5 schema,
 * then the page's own rules (known blocks only, each once, required blocks
 * visible on every device, only the elements this page offers), then the
 * checkout questions (checkout only, if any), then the page's Look changes
 * (if any), then store it (TEXT) and switch the designed page on. A result
 * carrying `form` means the questions were stored, even when the publish
 * itself then failed.
 */
export async function publishPageDesignAction(
  tenantId: string,
  page: unknown,
  design: unknown,
  look?: unknown,
  form?: unknown,
): Promise<PageDesignerFormResult> {
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

    // The design is checked first, so a refused design never saves half the change.
    // The checkout questions belong to the checkout page only.
    const hasForm = form !== undefined && form !== null && page === 'checkout'
    let savedForm: FormSaveOutcome | undefined
    if (hasForm) {
      const saved = await writeCheckoutForm(tenantId, form)
      if (!saved.success) return saved
      savedForm = saved.form
    }
    const hasLook = look !== undefined
    if (hasLook) {
      const saved = await writePageLook(tenantId, page, look)
      if (!saved.success) {
        return hasForm ? { success: false, error: `Your form was saved, but the page did not publish: ${saved.error}`, form: savedForm } : saved
      }
    }

    const columns = PAGE_DESIGN_COLUMNS[page]
    const published = await writeTenant(tenantId, { [columns.design]: serialized, [columns.enabled]: true }, 'publishPageDesignAction')
    // Publishing again is safe: a look or form already saved is not read as someone else's change.
    if (!published.success && (hasLook || hasForm)) {
      const what = hasLook && hasForm ? 'form and look were' : hasForm ? 'form was' : 'look was'
      return { success: false, error: `Your ${what} saved, but the page did not publish. Please publish again.`, form: savedForm }
    }
    return savedForm ? { ...published, form: savedForm } : published
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

