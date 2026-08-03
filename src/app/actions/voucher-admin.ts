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
import { verifyTenantPermission } from '@/lib/admin-service'
import {
  normalizeVoucherCode,
  validateVoucherDraft,
  type VoucherDraft,
  type VoucherIssue,
} from '@/lib/vouchers/admin-validation'
import { mapVoucherRow, type VoucherRow, type VoucherTargetRow } from '@/lib/vouchers/mapper'
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

/** Every voucher for a tenant, newest first, with targets attached. */
export async function listVouchersAction(tenantId: string): Promise<VoucherListResult> {
  try {
    await verifyTenantPermission(tenantId, 'vouchers')
    const supabase = createAdminClient()

    const { data: rows, error } = await supabase
      .from('vouchers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) return { success: false, error: error.message }

    const voucherRows = (rows ?? []) as unknown as VoucherRow[]
    if (voucherRows.length === 0) return { success: true, data: [] }

    const { data: targetRows } = await supabase
      .from('voucher_targets')
      .select('*')
      .in(
        'voucher_id',
        voucherRows.map((r) => r.id)
      )

    const targets = (targetRows ?? []) as unknown as VoucherTargetRow[]
    return { success: true, data: voucherRows.map((row) => mapVoucherRow(row, targets)) }
  } catch (error) {
    console.error('[listVouchersAction] Failed:', error)
    return { success: false, error: toMessage(error) }
  }
}

export async function saveVoucherAction(
  tenantId: string,
  draft: VoucherDraft,
  voucherId?: string
): Promise<VoucherAdminResult> {
  try {
    await verifyTenantPermission(tenantId, 'vouchers')

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

    revalidatePath(`/${tenantId}/admin/vouchers`)
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

    revalidatePath(`/${tenantId}/admin/vouchers`)
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
