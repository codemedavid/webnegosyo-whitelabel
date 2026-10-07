/**
 * get_vouchers — every voucher code (on/off, discount, limits, dates) with its
 * last 30 days of uses and pesos discounted. Voucher refs let a later turn
 * switch one off or back on.
 */

import { z } from 'zod'
import { formatCount, formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { readAssistantVouchers, type AssistantVouchers } from '@/lib/assistant/data/vouchers'
import type { Voucher } from '@/lib/vouchers/types'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const LIST_LIMIT = 12

const input = z.object({ show: z.enum(['all', 'active']).describe('Default all') })
type Input = z.infer<typeof input>

export function describeVoucherDiscount(voucher: Voucher): string {
  if (voucher.discountType === 'free_delivery') return 'Free delivery'
  if (voucher.discountType === 'fixed') return `${formatPeso(voucher.discountValue)} off`
  return `${voucher.discountValue}% off${voucher.maxDiscountAmount ? ` (up to ${formatPeso(voucher.maxDiscountAmount)})` : ''}`
}

/** On, off, scheduled, expired or used up — what the owner would call it today. */
export function voucherState(voucher: Voucher, now = Date.now()): 'on' | 'off' | 'scheduled' | 'expired' | 'used_up' {
  if (!voucher.isActive) return 'off'
  if (voucher.endsAt && Date.parse(voucher.endsAt) < now) return 'expired'
  if (voucher.startsAt && Date.parse(voucher.startsAt) > now) return 'scheduled'
  if (voucher.usageLimitTotal && voucher.usedCount >= voucher.usageLimitTotal) return 'used_up'
  return 'on'
}

const STATE_LABEL = { on: 'On', off: 'Off', scheduled: 'Scheduled', expired: 'Expired', used_up: 'Used up' } as const

export function buildVouchersResult(data: AssistantVouchers, show: Input['show'], refs: RefBook, now = Date.now()): ToolResult {
  const listed = data.vouchers.filter((voucher) => show === 'all' || voucherState(voucher, now) === 'on').slice(0, LIST_LIMIT)
  const use = (id: string) => data.last30Days?.get(id) ?? { uses: 0, discounted: 0 }
  return {
    facts: {
      total: data.vouchers.length,
      vouchers: listed.map((voucher) => ({
        ref: refs.refFor('voucher', voucher.id),
        code: voucher.code,
        state: voucherState(voucher, now),
        discount: describeVoucherDiscount(voucher),
        ...(voucher.minOrderAmount ? { minOrder: voucher.minOrderAmount } : {}),
        usedAllTime: voucher.usedCount,
        ...(voucher.usageLimitTotal ? { totalLimit: voucher.usageLimitTotal } : {}),
        ...(voucher.endsAt ? { ends: voucher.endsAt.slice(0, 10) } : {}),
        ...(data.last30Days ? { uses30d: use(voucher.id).uses, discounted30d: Math.round(use(voucher.id).discounted) } : {}),
      })),
      ...(data.last30Days ? {} : { caveat: '30-day redemptions could not be read.' }),
      ...(data.isRedemptionCountCapped ? { caveat: '30-day counts are a lower bound (very large history).' } : {}),
    },
    card: {
      type: 'ranked',
      title: 'Vouchers',
      subtitle: data.last30Days ? 'Uses in the last 30 days' : undefined,
      rows: listed.map((voucher) => ({
        label: voucher.code,
        value: data.last30Days ? `${formatCount(use(voucher.id).uses)} uses` : `${formatCount(voucher.usedCount)} uses`,
        detail: `${describeVoucherDiscount(voucher)}${data.last30Days && use(voucher.id).discounted > 0 ? ` · ${formatPeso(use(voucher.id).discounted)} given` : ''}`,
        badge: STATE_LABEL[voucherState(voucher, now)],
      })),
      emptyText: show === 'active' ? 'No vouchers are on right now.' : 'No vouchers yet.',
    },
    chips: [{ label: 'Make a voucher', prompt: 'Make a voucher for my quiet days' }],
    links: [{ label: 'Open Vouchers', path: '/vouchers' }],
  }
}

export const getVouchersTool: AssistantToolDef<Input> = {
  name: 'get_vouchers',
  description: 'Voucher codes (on/off/expired, discount, limits) with 30-day uses and pesos discounted.',
  access: { permission: 'vouchers' },
  input,
  async run(ctx, { show }) {
    try {
      const data = await ctx.memo('vouchers', () => readAssistantVouchers(ctx.tenantId))
      return buildVouchersResult(data, show, ctx.refs)
    } catch (error) {
      return { facts: { available: false, reason: error instanceof Error ? error.message : 'Vouchers could not be read.' } }
    }
  },
}
