/**
 * Reads both Expenses tabs share. Every one goes through the CALLER's session
 * client (RLS decides what comes back); never a service-role client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { readBillBoard } from '@/lib/expenses/bills/bills-read'
import { lateBillCount } from '@/components/admin/expenses/bills/bill-board-model'
import type { ExpensesOutlet } from '@/components/admin/expenses/expenses-page-data'

interface OutletRow {
  id: string
  name: string
  is_active: boolean | null
}

export async function readOutlets(db: SupabaseClient, tenantId: string): Promise<OutletRow[]> {
  const { data, error } = await db
    .from('outlets')
    .select('id, name, is_active')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  // A failed read must not look like "no branches": that would hide the branch picker.
  if (error) throw new Error(`Could not read the store's branches: ${error.message}`)
  return (data ?? []) as OutletRow[]
}

export interface OutletLists {
  /** Active branches, for pickers. */
  active: ExpensesOutlet[]
  /** Every branch the store has had, for names on old rows. */
  names: Record<string, string>
}

export function outletLists(rows: readonly OutletRow[]): OutletLists {
  return {
    active: rows.filter((outlet) => outlet.is_active === true).map((outlet) => ({ id: outlet.id, name: outlet.name })),
    names: Object.fromEntries(rows.map((outlet) => [outlet.id, outlet.name])),
  }
}

export interface BillsGlance {
  /** Bill id → name, for the table's "Bill" badge and "Paid for". */
  billNames: Record<string, string>
  /** Late bills today, for the "N late" on the Bills to pay tab. */
  lateCount: number
}

const NO_BILLS: BillsGlance = { billNames: {}, lateCount: 0 }

/**
 * What the expense book shows of Bills to pay: bill names and how many are
 * late. The same bounded read as the Bills tab (bills + a ~6-month window of
 * marks and bill payments, three small indexed queries in parallel), counted
 * by the same engine, so the two tabs never disagree.
 * Advisory: the book still opens without it (badge says "Bill", no late count).
 */
export async function readBillsGlance(db: SupabaseClient, tenantId: string, today: string): Promise<BillsGlance> {
  try {
    const board = await readBillBoard(db, tenantId, today)
    return {
      billNames: Object.fromEntries(board.bills.map((bill) => [bill.id, bill.name])),
      lateCount: lateBillCount({ ...board, today }),
    }
  } catch (error) {
    console.error('[expenses] bills glance unavailable', error instanceof Error ? error.message : error)
    return NO_BILLS
  }
}
