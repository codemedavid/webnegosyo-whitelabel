/**
 * Reads both Expenses tabs share. Every one goes through the CALLER's session
 * client (RLS decides what comes back); never a service-role client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { listBills } from '@/lib/expenses/bills/bills-read'
import type { Expense } from '@/lib/expenses/types'
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

/**
 * Bill names for the expenses that pay a bill (the table's "Bill" badge).
 * Advisory: the book still opens without them; the badge then says "Bill".
 */
export async function readBillNames(db: SupabaseClient, tenantId: string, expenses: readonly Expense[]): Promise<Record<string, string>> {
  if (!expenses.some((expense) => expense.billId !== null)) return {}
  try {
    const bills = await listBills(db, { tenantId })
    return Object.fromEntries(bills.map((bill) => [bill.id, bill.name]))
  } catch (error) {
    console.error('[expenses] bill names unavailable', error instanceof Error ? error.message : error)
    return {}
  }
}
