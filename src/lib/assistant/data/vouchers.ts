/**
 * Vouchers for the assistant: every code with its limits, plus 30 days of
 * redemptions (uses and pesos discounted) from `voucher_redemptions`, the
 * source of truth behind the cached `used_count`.
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { listVouchersAction } from '@/app/actions/voucher-admin'
import type { Voucher } from '@/lib/vouchers/types'

const REDEMPTION_LIMIT = 5000
const WINDOW_DAYS = 30
const DAY_MS = 86_400_000

export interface VoucherUse {
  uses: number
  discounted: number
}

export interface AssistantVouchers {
  vouchers: readonly Voucher[]
  last30Days: Map<string, VoucherUse> | null
  isRedemptionCountCapped: boolean
}

async function readRedemptions(tenantId: string, now: number): Promise<{ uses: Map<string, VoucherUse>; isCapped: boolean } | null> {
  const client = createAdminClient() as unknown as SupabaseClient
  const { data, error } = await client
    .from('voucher_redemptions')
    .select('voucher_id, amount_discounted')
    .eq('tenant_id', tenantId)
    .gte('created_at', new Date(now - WINDOW_DAYS * DAY_MS).toISOString())
    .limit(REDEMPTION_LIMIT)
  if (error) {
    console.error('[assistant] voucher redemptions unavailable', { tenantId, message: error.message })
    return null
  }
  const uses = new Map<string, VoucherUse>()
  for (const row of (data ?? []) as Array<{ voucher_id: string; amount_discounted: number | string | null }>) {
    const current = uses.get(row.voucher_id) ?? { uses: 0, discounted: 0 }
    uses.set(row.voucher_id, { uses: current.uses + 1, discounted: current.discounted + (Number(row.amount_discounted) || 0) })
  }
  return { uses, isCapped: (data ?? []).length >= REDEMPTION_LIMIT }
}

/** Throws the list's own error (e.g. no `vouchers` permission) for the tool to report. */
export async function readAssistantVouchers(tenantId: string, now = Date.now()): Promise<AssistantVouchers> {
  const [list, redemptions] = await Promise.all([listVouchersAction(tenantId), readRedemptions(tenantId, now)])
  if (!list.success || !list.data) throw new Error(list.error ?? 'Vouchers could not be read.')
  return { vouchers: list.data, last30Days: redemptions?.uses ?? null, isRedemptionCountCapped: redemptions?.isCapped ?? false }
}
