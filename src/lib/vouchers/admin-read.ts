/**
 * The merchant's voucher list, read in ONE query.
 *
 * `voucher_targets.voucher_id` references `vouchers.id`, so PostgREST embeds the
 * targets in the voucher read. The list used to fetch the vouchers and only then
 * — a second sequential round trip — every target of every voucher.
 *
 * Kept out of `app/actions/voucher-admin.ts` on purpose: every export of a
 * `'use server'` file is a callable endpoint, and this mapping has no business
 * being one.
 */

import { mapVoucherRow, type VoucherRow, type VoucherTargetRow } from './mapper'
import type { Voucher } from './types'

export const VOUCHER_LIST_SELECT = '*, voucher_targets(voucher_id, target_type, target_id)'

export type VoucherListRow = VoucherRow & { voucher_targets?: readonly VoucherTargetRow[] | null }

export function mapVoucherListRows(rows: readonly VoucherListRow[]): Voucher[] {
  return rows.map(({ voucher_targets: targets, ...row }) => mapVoucherRow(row, targets ?? []))
}
