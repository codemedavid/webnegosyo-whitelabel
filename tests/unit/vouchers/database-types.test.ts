/**
 * Guardrail: the generated Supabase types must actually describe the voucher
 * schema that is already live in the database.
 *
 * `src/types/supabase.ts` is generated, so it drifts silently: the migration
 * applies, the tables exist, every query works at runtime — and `.from('vouchers')`
 * refuses to compile because the type file predates the migration. Worse, the
 * hand-written `VoucherRow` in the mapper is the only description of that table
 * the engine has, and nothing forces it to agree with the real column set. A
 * column renamed in a later migration would leave the mapper reading `undefined`
 * and quietly handing every voucher a zero discount.
 *
 * The type-level assertions below are the real guarantee. They are erased at
 * runtime (Jest transforms via SWC, which does not typecheck), so they fail
 * under `tsc --noEmit` rather than under Jest — which is exactly where a schema
 * drift should be caught. The source-level assertions give the same drift a
 * runtime signal so a Jest-only run cannot miss it entirely.
 */
import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { Database } from '@/types/supabase'
import type { VoucherRow, VoucherTargetRow } from '@/lib/vouchers/mapper'

type Tables = Database['public']['Tables']

/**
 * The mapper's hand-written row shapes must be satisfiable by the real generated
 * rows. Assignability in this direction is what matters: a generated row must be
 * usable everywhere the mapper expects one. Drop a column from the migration and
 * this stops compiling.
 */
type VoucherRowMatchesSchema = Tables['vouchers']['Row'] extends VoucherRow ? true : never
type VoucherTargetRowMatchesSchema = Tables['voucher_targets']['Row'] extends VoucherTargetRow
  ? true
  : never

/** Discount columns must exist on the order tables, not just in the migration file. */
type OrdersCarryDiscount = Tables['orders']['Row'] extends {
  discount_total: number
  discount_data: unknown
}
  ? true
  : never
type OrderItemsCarryDiscount = Tables['order_items']['Row'] extends { discount_amount: number }
  ? true
  : never

/** The redemption RPC must be exposed, or the write path has no way to burn a use. */
type RedeemVoucherExposed = Database['public']['Functions']['redeem_voucher'] extends {
  Args: unknown
}
  ? true
  : never

const voucherRowMatches: VoucherRowMatchesSchema = true
const voucherTargetRowMatches: VoucherTargetRowMatchesSchema = true
const ordersCarryDiscount: OrdersCarryDiscount = true
const orderItemsCarryDiscount: OrderItemsCarryDiscount = true
const redeemVoucherExposed: RedeemVoucherExposed = true

const GENERATED_TYPES = join(process.cwd(), 'src/types/supabase.ts')

function readGeneratedTypes(): string {
  return readFileSync(GENERATED_TYPES, 'utf8')
}

describe('generated database types describe the voucher schema', () => {
  it.each(['vouchers', 'voucher_targets', 'voucher_redemptions'])(
    'declares the %s table',
    (table) => {
      expect(readGeneratedTypes()).toContain(`${table}: {`)
    },
  )

  it('declares the redeem_voucher function', () => {
    expect(readGeneratedTypes()).toContain('redeem_voucher: {')
  })

  it.each(['discount_total', 'discount_data', 'discount_amount'])(
    'declares the %s order column',
    (column) => {
      expect(readGeneratedTypes()).toContain(column)
    },
  )

  it('keeps the mapper row shapes assignable from the generated rows', () => {
    // The assertions themselves are compile-time; this asserts they were kept.
    expect([
      voucherRowMatches,
      voucherTargetRowMatches,
      ordersCarryDiscount,
      orderItemsCarryDiscount,
      redeemVoucherExposed,
    ]).toEqual([true, true, true, true, true])
  })
})
