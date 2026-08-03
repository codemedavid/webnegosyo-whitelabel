'use server'

/**
 * Voucher preview for the checkout and the register.
 *
 * Read-only and non-authoritative: it decides what the customer is SHOWN while
 * they are still typing. The amount actually charged is recomputed inside
 * `createOrderAction` from the codes themselves — see
 * `src/lib/vouchers/order-pricing.ts`.
 *
 * Reads through the service-role client because `vouchers` has no anon RLS
 * policy by design (see migration 20260817120000, section 8): the table is
 * server-only. That makes the projection in `buildVoucherPreview` the thing
 * standing between a visitor and every voucher's remaining redemptions, so
 * this action must never widen what it returns.
 *
 * NOTE: no `export type { … }` in this file. A type re-export from a
 * `'use server'` module throws at build time while tsc and Jest both stay
 * green.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { buildVoucherPreview } from '@/lib/vouchers/preview'
import { createVoucherLookup } from '@/lib/vouchers/repository'
import type { VoucherChannel, DiscountLine } from '@/lib/vouchers/types'
import type { VoucherPreview } from '@/lib/vouchers/preview'

export interface ValidateVoucherInput {
  tenantId: string
  codes: string[]
  lines: Array<{
    id: string
    menuItemId: string
    categoryId?: string | null
    quantity: number
    subtotal: number
  }>
  deliveryFee?: number | null
  serviceCharge?: number | null
  channel?: VoucherChannel
  outletId?: string | null
  customerKey?: string | null
}

export interface ValidateVoucherResult {
  success: boolean
  data?: VoucherPreview
  error?: string
}

const VALID_CHANNELS: readonly VoucherChannel[] = ['checkout', 'pos', 'admin']

function toFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Trusts nothing about the shape; the caller is a browser. */
function sanitizeLines(lines: ValidateVoucherInput['lines']): DiscountLine[] {
  if (!Array.isArray(lines)) return []

  return lines
    .filter((line) => line && typeof line.menuItemId === 'string')
    .map((line, index) => ({
      id: typeof line.id === 'string' && line.id !== '' ? line.id : `line-${index}`,
      menuItemId: line.menuItemId,
      categoryId: typeof line.categoryId === 'string' ? line.categoryId : null,
      quantity: Math.max(0, toFiniteNumber(line.quantity)),
      subtotal: Math.max(0, toFiniteNumber(line.subtotal)),
    }))
}

export async function validateVoucherAction(
  input: ValidateVoucherInput,
): Promise<ValidateVoucherResult> {
  try {
    if (!input?.tenantId || typeof input.tenantId !== 'string') {
      return { success: false, error: 'Invalid tenant ID' }
    }

    const codes = Array.isArray(input.codes) ? input.codes.filter((c) => typeof c === 'string') : []
    if (codes.length === 0) {
      return {
        success: true,
        data: { accepted: [], rejected: [], discountTotal: 0, deliveryDiscount: 0 },
      }
    }

    const lines = sanitizeLines(input.lines)
    if (lines.length === 0) {
      return { success: false, error: 'Your cart is empty' }
    }

    const channel =
      input.channel && VALID_CHANNELS.includes(input.channel) ? input.channel : 'checkout'

    const preview = await buildVoucherPreview({
      tenantId: input.tenantId,
      codes,
      customerKey: input.customerKey ?? null,
      lookup: createVoucherLookup(createAdminClient()),
      context: {
        lines,
        deliveryFee: toFiniteNumber(input.deliveryFee),
        serviceCharge: toFiniteNumber(input.serviceCharge),
        channel,
        // Server clock. A browser with a shifted clock must not be able to
        // revive an expired voucher.
        now: new Date(),
        outletId: input.outletId ?? null,
      },
    })

    return { success: true, data: preview }
  } catch (error) {
    console.error('[validateVoucherAction] Failed to preview voucher:', error)
    return { success: false, error: 'Could not check that voucher. Please try again.' }
  }
}
