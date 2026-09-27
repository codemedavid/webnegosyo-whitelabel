/**
 * DB row → domain `Voucher`.
 *
 * The one boundary where snake_case, nullable numerics and Postgres arrays
 * become the shape the engine was tested against. Every field mis-mapped here
 * is a silently wrong discount rather than a crash: a dropped
 * `max_discount_amount` uncaps a percentage, a dropped `is_stackable` lets a
 * solo voucher stack, and a null usage limit coerced to 0 would disable every
 * unlimited voucher in the system.
 */

import type { Voucher, VoucherChannel, VoucherDiscountType, VoucherScope } from './types'

export interface VoucherRow {
  id: string
  tenant_id: string
  code: string
  name: string
  description: string | null
  discount_type: string
  discount_value: number
  max_discount_amount: number | null
  min_order_amount: number | null
  scope: string
  is_stackable: boolean
  usage_limit_total: number | null
  usage_limit_per_customer: number | null
  used_count: number
  starts_at: string | null
  ends_at: string | null
  channels: string[] | null
  outlet_ids: string[] | null
  is_active: boolean
}

export interface VoucherTargetRow {
  voucher_id: string
  target_type: string
  target_id: string
}

const ALL_CHANNELS: readonly VoucherChannel[] = ['checkout', 'pos', 'admin']

/**
 * pg returns `numeric` columns as strings. Left uncoerced they mostly work by
 * accident and then fail at exactly one comparison, so they are normalized here
 * rather than defensively everywhere downstream.
 */
function toNumber(value: number | string | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Null stays null: it means "unlimited", which is not the same as zero. */
function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toChannels(value: string[] | null | undefined): readonly VoucherChannel[] {
  if (!Array.isArray(value) || value.length === 0) return ALL_CHANNELS
  const known = value.filter((channel): channel is VoucherChannel =>
    (ALL_CHANNELS as readonly string[]).includes(channel),
  )
  return known.length > 0 ? known : ALL_CHANNELS
}

export function mapVoucherRow(row: VoucherRow, targets: readonly VoucherTargetRow[] = []): Voucher {
  const scope = row.scope as VoucherScope

  // Scoped vouchers always get a list, even an empty one — the engine reads an
  // empty list as "matches nothing", which is the safe reading of a
  // misconfigured voucher. Universal vouchers get none at all.
  const wantedTargetType = scope === 'categories' ? 'category' : 'menu_item'
  const targetIds =
    scope === 'universal'
      ? undefined
      : targets
          .filter((t) => t.voucher_id === row.id && t.target_type === wantedTargetType)
          .map((t) => t.target_id)

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    discountType: row.discount_type as VoucherDiscountType,
    discountValue: toNumber(row.discount_value, 0),
    maxDiscountAmount: toNullableNumber(row.max_discount_amount),
    minOrderAmount: toNumber(row.min_order_amount, 0),
    scope,
    ...(targetIds ? { targetIds } : {}),
    isStackable: row.is_stackable === true,
    usageLimitTotal: toNullableNumber(row.usage_limit_total),
    usageLimitPerCustomer: toNullableNumber(row.usage_limit_per_customer),
    usedCount: toNumber(row.used_count, 0),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    channels: toChannels(row.channels),
    outletIds: row.outlet_ids ?? null,
    isActive: row.is_active === true,
  }
}
