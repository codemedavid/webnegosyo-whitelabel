/**
 * propose_voucher_status — switch a voucher off (it stops working at checkout
 * and the POS) or back on. Vouchers are never deleted: past orders still need
 * their code to resolve.
 */

import { z } from 'zod'
import { readAssistantVouchers } from '@/lib/assistant/data/vouchers'
import { describeVoucherDiscount } from '@/lib/assistant/tools/reads/vouchers'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { VoucherStatusPayload } from '@/lib/assistant/actions/kinds'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

const input = z.object({
  voucher: z.string().describe('Voucher ref from get_vouchers'),
  active: z.boolean().describe('false = switch off'),
})
type Input = z.infer<typeof input>

export const proposeVoucherStatusTool: AssistantToolDef<Input> = {
  name: 'propose_voucher_status',
  description: 'Propose switching a voucher off or back on. The user must confirm.',
  access: { permission: 'vouchers' },
  input,
  async run(ctx, request) {
    const voucherId = ctx.refs.resolve(request.voucher, 'voucher')
    if (!voucherId) return refused('Unknown voucher ref. Call get_vouchers first.')
    let vouchers
    try {
      vouchers = (await ctx.memo('vouchers', () => readAssistantVouchers(ctx.tenantId))).vouchers
    } catch (error) {
      return refused(error instanceof Error ? error.message : 'Vouchers could not be read.')
    }
    const voucher = vouchers.find((row) => row.id === voucherId)
    if (!voucher) return refused('That voucher no longer exists.')
    if (voucher.isActive === request.active) return refused(`Voucher ${voucher.code} is already ${request.active ? 'on' : 'off'}.`)

    const payload: VoucherStatusPayload = { voucherId: voucher.id, code: voucher.code, isActive: request.active }
    return fileProposal(ctx, {
      kind: 'voucher_status',
      payload,
      summary: `Switch voucher ${voucher.code} ${request.active ? 'on' : 'off'}`,
      title: `${request.active ? 'Switch on' : 'Switch off'} voucher ${voucher.code}`,
      lines: [
        { label: 'Discount', value: describeVoucherDiscount(voucher) },
        { label: 'Change', value: request.active ? 'Customers can use it again' : 'Stops working at checkout and the POS (kept for past orders)' },
      ],
      warning: request.active ? 'Works at checkout as soon as you confirm (within its dates).' : undefined,
    })
  },
}
