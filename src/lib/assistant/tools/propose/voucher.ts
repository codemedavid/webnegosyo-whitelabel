/**
 * propose_voucher — a discount code, validated by the same rules as the
 * voucher form. A voucher with no start date works at checkout the moment it
 * is confirmed, and the card says so.
 */

import { z } from 'zod'
import { normalizeVoucherCode, validateVoucherDraft, type VoucherDraft } from '@/lib/vouchers/admin-validation'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

const input = z.object({
  code: z.string().trim().min(3).max(20),
  name: z.string().trim().min(3).max(60),
  discount: z.object({ type: z.enum(['percent', 'fixed', 'free_delivery']), value: z.number().min(0).max(100_000) }),
  minOrder: z.number().min(0).nullable(),
  maxDiscount: z.number().positive().nullable().describe('Cap for percent discounts'),
  items: z.array(z.string()).max(20).nullable().describe('Item refs to limit it to; null = whole order'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe('YYYY-MM-DD; null = immediately'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  usesPerCustomer: z.number().int().positive().nullable(),
})
type Input = z.infer<typeof input>

/** Manila midnight of a YYYY-MM-DD date, as ISO. */
function manilaMidnight(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toISOString()
}

function manilaEndOfDay(date: string): string {
  return new Date(`${date}T23:59:59+08:00`).toISOString()
}

function describeDiscount(discount: Input['discount'], maxDiscount: number | null): string {
  if (discount.type === 'free_delivery') return 'Free delivery'
  if (discount.type === 'fixed') return `${formatPeso(discount.value)} off`
  return `${discount.value}% off${maxDiscount ? ` (up to ${formatPeso(maxDiscount)})` : ''}`
}

export const proposeVoucherTool: AssistantToolDef<Input> = {
  name: 'propose_voucher',
  description: 'Propose a voucher code (percent/fixed/free_delivery, optional min order, dates, item limits). The user must confirm.',
  access: { permission: 'vouchers' },
  input,
  async run(ctx, request) {
    const targetIds = (request.items ?? []).map((ref) => ctx.refs.resolve(ref, 'item'))
    if (targetIds.some((id) => !id)) return refused('Unknown item ref. Use search_menu first.')

    const draft: VoucherDraft = {
      code: normalizeVoucherCode(request.code),
      name: request.name,
      discountType: request.discount.type,
      discountValue: request.discount.type === 'free_delivery' ? 0 : request.discount.value,
      maxDiscountAmount: request.maxDiscount,
      minOrderAmount: request.minOrder,
      scope: targetIds.length > 0 ? 'products' : 'universal',
      targetIds: targetIds as string[],
      isStackable: false,
      usageLimitTotal: null,
      usageLimitPerCustomer: request.usesPerCustomer,
      startsAt: request.startDate ? manilaMidnight(request.startDate) : null,
      endsAt: request.endDate ? manilaEndOfDay(request.endDate) : null,
    }
    const { errors, warnings } = validateVoucherDraft(draft)
    if (errors.length > 0) return refused(errors.map((issue) => issue.message).join(' '))

    return fileProposal(ctx, {
      kind: 'voucher',
      payload: { draft },
      summary: `Voucher ${draft.code}: ${describeDiscount(request.discount, request.maxDiscount)}`,
      title: `Voucher ${draft.code}`,
      lines: [
        { label: 'Discount', value: describeDiscount(request.discount, request.maxDiscount) },
        ...(request.minOrder ? [{ label: 'Min order', value: formatPeso(request.minOrder) }] : []),
        { label: 'Applies to', value: targetIds.length > 0 ? `${targetIds.length} dish${targetIds.length === 1 ? '' : 'es'}` : 'Whole order' },
        { label: 'Valid', value: `${request.startDate ?? 'Now'} → ${request.endDate ?? 'no end date'}` },
        ...(request.usesPerCustomer ? [{ label: 'Per customer', value: `${request.usesPerCustomer} use${request.usesPerCustomer === 1 ? '' : 's'}` }] : []),
        ...warnings.slice(0, 1).map((issue) => ({ label: 'Note', value: issue.message })),
      ],
      warning: request.startDate ? undefined : 'Works at checkout as soon as you confirm.',
    })
  },
}
