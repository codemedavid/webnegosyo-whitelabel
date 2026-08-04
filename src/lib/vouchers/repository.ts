/**
 * Supabase-backed voucher reads and the redemption write.
 *
 * The only module in the feature that knows what a database is. Everything
 * above it — eligibility, discount allocation, stacking, resolution — is pure.
 *
 * Both entry points take the client rather than constructing one, so callers
 * choose their own privilege level and the tests need no database.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { mapVoucherRow, type VoucherRow, type VoucherTargetRow } from './mapper'
import type { VoucherLookup } from './resolve'
import type { Voucher, VoucherChannel } from './types'

type Client = SupabaseClient<Database>

export interface RedeemVoucherInput {
  tenantId: string
  voucherId: string
  orderId: string
  amount: number
  channel: VoucherChannel
  /** Absent for a guest. */
  customerKey?: string | null
  outletId?: string | null
  redeemedBy?: string | null
}

export interface RedeemVoucherResult {
  redeemed: boolean
  error?: string
}

export function createVoucherLookup(client: Client): VoucherLookup {
  return {
    async findByCodes(tenantId: string, codes: readonly string[]): Promise<readonly Voucher[]> {
      if (codes.length === 0) return []

      // Tenant scoping belongs in the query. This runs under the service-role
      // client, which bypasses RLS by design, so a filter applied afterwards
      // would still have read another merchant's vouchers off the wire.
      const { data: voucherRows, error } = await client
        .from('vouchers')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('code', codes as string[])

      if (error || !voucherRows || voucherRows.length === 0) return []

      const rows = voucherRows as unknown as VoucherRow[]
      const scoped = rows.filter((row) => row.scope !== 'universal')

      // A universal-only result needs no second round trip.
      const targets = scoped.length === 0 ? [] : await findTargets(client, scoped.map((r) => r.id))

      return rows.map((row) => mapVoucherRow(row, targets))
    },

    async countCustomerRedemptions(
      tenantId: string,
      voucherIds: readonly string[],
      customerKey: string,
    ): Promise<Readonly<Record<string, number>>> {
      if (voucherIds.length === 0) return {}

      const { data, error } = await client
        .from('voucher_redemptions')
        .select('voucher_id')
        .eq('tenant_id', tenantId)
        .eq('customer_key', customerKey)
        .in('voucher_id', voucherIds as string[])

      if (error || !data) return {}

      const counts: Record<string, number> = {}
      for (const row of data as unknown as Array<{ voucher_id: string }>) {
        counts[row.voucher_id] = (counts[row.voucher_id] ?? 0) + 1
      }

      return counts
    },
  }
}

async function findTargets(
  client: Client,
  voucherIds: readonly string[],
): Promise<VoucherTargetRow[]> {
  const { data, error } = await client
    .from('voucher_targets')
    .select('*')
    .in('voucher_id', voucherIds as string[])

  if (error || !data) return []
  return data as unknown as VoucherTargetRow[]
}

/**
 * Burns one use.
 *
 * The conditional UPDATE inside `redeem_voucher()` is what actually prevents
 * over-redemption — not anything in this file, and not the advisory
 * `usedCount` the engine reads. A caller that ignores `redeemed: false` is
 * handing out unlimited uses of a limited voucher, so the failure is returned
 * rather than logged and dropped.
 *
 * Keyed on the order id: the unique `(voucher_id, order_id)` index makes a
 * retry a no-op instead of a second burn.
 */
export async function redeemVoucher(
  client: Client,
  input: RedeemVoucherInput,
): Promise<RedeemVoucherResult> {
  const customerKey = input.customerKey?.trim()
  const outletId = input.outletId?.trim()
  const redeemedBy = input.redeemedBy?.trim()

  const { data, error } = await client.rpc('redeem_voucher', {
    p_tenant_id: input.tenantId,
    p_voucher_id: input.voucherId,
    p_order_id: input.orderId,
    p_amount: input.amount,
    p_channel: input.channel,
    // Optional args are omitted rather than sent as empty strings — an empty
    // customer key would group every guest into one "customer" and trip
    // per-customer limits for people who have never used the code.
    ...(customerKey ? { p_customer_key: customerKey } : {}),
    ...(outletId ? { p_outlet_id: outletId } : {}),
    ...(redeemedBy ? { p_redeemed_by: redeemedBy } : {}),
  })

  if (error) return { redeemed: false, error: error.message }

  // `redeem_voucher()` returns the new redemption's uuid, or NULL when its
  // conditional UPDATE claimed nothing — usage limit reached, voucher
  // deactivated, outside its date window, or a different tenant's row. None of
  // those set `error`, so a null row is the ONLY signal that the burn was
  // refused. Reading `error` alone reports success for every one of them.
  if (data == null) {
    return {
      redeemed: false,
      error: 'The database refused the redemption: the voucher is exhausted, inactive, outside its date window, or not this tenant’s.',
    }
  }

  return { redeemed: true }
}
