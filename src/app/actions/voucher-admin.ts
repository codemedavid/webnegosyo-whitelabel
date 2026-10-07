'use server'

/**
 * Merchant-side voucher management.
 *
 * Kept apart from `vouchers.ts`, which is the public customer preview. These
 * are the write paths, and every one of them is gated on the `vouchers`
 * permission — a standing discount on the merchant's own revenue is not
 * something every staff member who can rename a dish should be able to mint.
 *
 * Validation runs here as well as in the form. The form's copy is a courtesy;
 * this one is the rule, because a server action is reachable without the form.
 *
 * NOTE: no `export type { … }` in this file. A type re-export from a
 * `'use server'` module throws at build time while tsc and Jest stay green.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import {
  normalizeVoucherCode,
  validateVoucherDraft,
  type VoucherDraft,
  type VoucherIssue,
} from '@/lib/vouchers/admin-validation'
import { mapVoucherListRows, VOUCHER_LIST_SELECT, type VoucherListRow } from '@/lib/vouchers/admin-read'
import { toCategoryOptions, toProductOptions, type TargetOption } from '@/lib/vouchers/target-picker'
import type { Voucher } from '@/lib/vouchers/types'

export interface VoucherAdminResult {
  success: boolean
  error?: string
  issues?: readonly VoucherIssue[]
  voucherId?: string
}

export interface VoucherListResult {
  success: boolean
  error?: string
  data?: readonly Voucher[]
}

export interface VoucherTargetOptionsResult {
  success: boolean
  error?: string
  data?: readonly TargetOption[]
}

/**
 * `revalidatePath` on the route PATTERN: these actions are handed the tenant id,
 * not its slug, and `/${tenantId}/admin/vouchers` named a page that does not
 * exist. The pattern form names the real page for every store.
 */
const VOUCHERS_ROUTE = '/[tenant]/admin/vouchers'

/**
 * Every voucher for a tenant, newest first, with targets attached — one query,
 * the targets embedded (admin-read.ts). The vouchers page calls this on the
 * server for its first render; it is still an action for the same permission
 * check wherever it is called from.
 */
export async function listVouchersAction(tenantId: string): Promise<VoucherListResult> {
  try {
    await verifyTenantPermission(tenantId, 'vouchers', 'view')
    const supabase = createAdminClient()

    const { data: rows, error } = await supabase
      .from('vouchers')
      .select(VOUCHER_LIST_SELECT)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) return { success: false, error: error.message }

    return { success: true, data: mapVoucherListRows((rows ?? []) as unknown as VoucherListRow[]) }
  } catch (error) {
    console.error('[listVouchersAction] Failed:', error)
    return { success: false, error: toMessage(error) }
  }
}

/**
 * What the voucher form's target picker lists: names only, in ONE call.
 *
 * The picker used to call two actions (the full menu with every dish's
 * variation/add-on JSON and an embedded category, then the categories). Next
 * runs server actions one at a time, so its `Promise.all` never overlapped
 * them. Here both lean reads run in parallel inside one request.
 */
export async function getVoucherTargetOptionsAction(
  tenantId: string,
  mode: 'products' | 'categories'
): Promise<VoucherTargetOptionsResult> {
  try {
    await verifyTenantPermission(tenantId, 'vouchers', 'view')
    const supabase = await createClient()

    const [categories, items] = await Promise.all([
      supabase.from('categories').select('id, name').eq('tenant_id', tenantId).order('order', { ascending: true }),
      mode === 'products'
        ? supabase
            .from('menu_items')
            .select('id, name, category_id')
            .eq('tenant_id', tenantId)
            .order('order', { ascending: true })
            .order('id', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (categories.error) return { success: false, error: categories.error.message }
    if (items.error) return { success: false, error: items.error.message }

    const categoryRows = (categories.data ?? []) as { id: string; name: string }[]
    const itemRows = (items.data ?? []) as { id: string; name: string; category_id: string | null }[]
    return {
      success: true,
      data: mode === 'products' ? toProductOptions(itemRows, categoryRows) : toCategoryOptions(categoryRows),
    }
  } catch (error) {
    console.error('[getVoucherTargetOptionsAction] Failed:', error)
    return { success: false, error: toMessage(error) }
  }
}

export async function saveVoucherAction(
  tenantId: string,
  draft: VoucherDraft,
  voucherId?: string
): Promise<VoucherAdminResult> {
  try {
    await verifyTenantPermission(tenantId, 'vouchers', voucherId ? 'edit' : 'create')

    // The form validates too, but a server action is reachable without it.
    const { errors } = validateVoucherDraft(draft)
    if (errors.length > 0) {
      return { success: false, error: 'Please fix the highlighted fields.', issues: errors }
    }

    const supabase = createAdminClient()
    const code = normalizeVoucherCode(draft.code)

    const row = {
      tenant_id: tenantId,
      code,
      name: draft.name.trim(),
      discount_type: draft.discountType,
      discount_value: draft.discountType === 'free_delivery' ? 0 : draft.discountValue,
      max_discount_amount: draft.maxDiscountAmount ?? null,
      min_order_amount: draft.minOrderAmount ?? 0,
      scope: draft.scope,
      is_stackable: draft.isStackable,
      usage_limit_total: draft.usageLimitTotal ?? null,
      usage_limit_per_customer: draft.usageLimitPerCustomer ?? null,
      starts_at: draft.startsAt ?? null,
      ends_at: draft.endsAt ?? null,
      channels: draft.channels ? [...draft.channels] : ['checkout', 'pos', 'admin'],
    }

    const saved = voucherId
      ? await supabase.from('vouchers').update(row).eq('id', voucherId).eq('tenant_id', tenantId).select('id').single()
      : await supabase.from('vouchers').insert(row).select('id').single()

    if (saved.error) {
      // The unique index on (tenant_id, lower(code)) is the authority on
      // duplicates; catching it here turns a raw Postgres error into English.
      if (saved.error.code === '23505') {
        return {
          success: false,
          error: `The code ${code} is already in use.`,
          issues: [{ field: 'code', message: 'This code already exists.' }],
        }
      }
      return { success: false, error: saved.error.message }
    }

    const savedId = (saved.data as { id: string }).id
    const targetError = await replaceTargets(supabase, savedId, draft)
    if (targetError) return { success: false, error: targetError }

    revalidatePath(VOUCHERS_ROUTE, 'page')
    return { success: true, voucherId: savedId }
  } catch (error) {
    console.error('[saveVoucherAction] Failed:', error)
    return { success: false, error: toMessage(error) }
  }
}

/**
 * Retires a voucher instead of deleting it.
 *
 * `voucher_redemptions` references it, and a merchant looking at a past
 * discounted order needs the code to still resolve to something. Deactivating
 * stops it being accepted; deleting would orphan history.
 */
export async function setVoucherActiveAction(
  tenantId: string,
  voucherId: string,
  isActive: boolean
): Promise<VoucherAdminResult> {
  try {
    await verifyTenantPermission(tenantId, 'vouchers')
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('vouchers')
      .update({ is_active: isActive })
      .eq('id', voucherId)
      .eq('tenant_id', tenantId)

    if (error) return { success: false, error: error.message }

    revalidatePath(VOUCHERS_ROUTE, 'page')
    return { success: true, voucherId }
  } catch (error) {
    console.error('[setVoucherActiveAction] Failed:', error)
    return { success: false, error: toMessage(error) }
  }
}

/** Replace-all rather than diff: the target set is small and order-free. */
async function replaceTargets(
  supabase: ReturnType<typeof createAdminClient>,
  voucherId: string,
  draft: VoucherDraft
): Promise<string | null> {
  const { error: clearError } = await supabase
    .from('voucher_targets')
    .delete()
    .eq('voucher_id', voucherId)

  if (clearError) return clearError.message
  if (draft.scope === 'universal' || !draft.targetIds || draft.targetIds.length === 0) return null

  const targetType = draft.scope === 'categories' ? 'category' : 'menu_item'
  const { error: insertError } = await supabase.from('voucher_targets').insert(
    draft.targetIds.map((targetId) => ({
      voucher_id: voucherId,
      target_type: targetType,
      target_id: targetId,
    }))
  )

  return insertError?.message ?? null
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Unauthorized')) {
    return 'You do not have permission to manage vouchers.'
  }
  return 'Something went wrong. Please try again.'
}
