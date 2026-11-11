/**
 * How many recorded expenses ever paid a bill, for the Stop confirmation
 * ("Your 7 past payments stay in Expenses"). The board only reads a few
 * months of payments, so this asks the database directly, through the
 * caller's browser session (RLS decides; a head count reads no rows).
 */

import type { ExpenseDb } from '@/lib/expenses/read/expenses-read'
import { createClient } from '@/lib/supabase/client'

/** The count, or null when it couldn't be read (the dialog then says it without a number). */
export async function countBillPayments(tenantId: string, billId: string): Promise<number | null> {
  try {
    const db = createClient() as unknown as ExpenseDb
    const { count, error } = await db
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('bill_id', billId)
      .eq('status', 'recorded')
    if (error) {
      console.error('[expense-bills] payment count unavailable', error.message)
      return null
    }
    return count ?? null
  } catch (error) {
    console.error('[expense-bills] payment count unavailable', error instanceof Error ? error.message : error)
    return null
  }
}

/** "Your 3 past payments stay in Expenses." */
export function pastPaymentsWords(count: number | null): string {
  if (count === null) return 'Your past payments stay in Expenses.'
  if (count === 0) return 'Nothing was paid on it yet, so nothing changes in Expenses.'
  return count === 1 ? 'Your 1 past payment stays in Expenses.' : `Your ${count} past payments stay in Expenses.`
}
