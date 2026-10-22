import type { SupabaseClient } from '@supabase/supabase-js'
import { LATE_LOOKBACK_DAYS } from '@/lib/expenses/bill-schedule'
import { readBillBoard } from '@/lib/expenses/bills/bills-read'
import { listCategories, listExpenses, listSuppliers } from '@/lib/expenses/expense-service'
import { addDays } from '@/lib/expenses/manila-date'
import { createClient } from '@/lib/supabase/server'
import { LINK_WINDOW_DAYS } from '@/components/admin/expenses/bills/bill-board-model'
import type { BillsPageData } from '@/components/admin/expenses/bills/bills-page-data'
import { BillsWorkspace } from '@/components/admin/expenses/bills/bills-workspace'
import { manilaToday } from '@/components/admin/expenses/expense-format'
import { ExpensesTabs } from '@/components/admin/expenses/expenses-tabs'
import { readOutlets, outletLists } from './expenses-reads'

interface BillsBookProps {
  tenant: { id: string; slug: string; isMultiBranch: boolean; tracksStock: boolean }
  lockedOutletId: string | null
  /** The `?month=` to carry back to the Expenses tab. */
  monthKey: string | null
}

/** How far back "I already recorded it" looks: the oldest late due date, plus its ±10 days. */
const LINKABLE_DAYS_BACK = LATE_LOOKBACK_DAYS + LINK_WINDOW_DAYS

/**
 * "Bills to pay" (bills-contract §5). Same access as the book: the page has
 * already checked the `expenses` key; every read here goes through the
 * caller's session, so RLS hands a branch-locked account its own branch's
 * bills only.
 */
export async function BillsBook({ tenant, lockedOutletId, monthKey }: BillsBookProps) {
  const today = manilaToday()
  const db = (await createClient()) as unknown as SupabaseClient

  let data: BillsPageData
  try {
    const [categories, suppliers, outletRows, board, recent] = await Promise.all([
      listCategories(db, tenant.id),
      listSuppliers(db, tenant.id),
      readOutlets(db, tenant.id),
      readBillBoard(db, tenant.id, today),
      listExpenses(db, {
        tenantId: tenant.id,
        from: addDays(today, -LINKABLE_DAYS_BACK),
        to: today,
        status: 'recorded',
        ...(lockedOutletId ? { outletId: lockedOutletId } : {}),
      }),
    ])
    const outlets = outletLists(outletRows)
    data = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      today,
      monthKey,
      categories,
      suppliers,
      outlets: outlets.active,
      outletNames: outlets.names,
      isMultiBranch: tenant.isMultiBranch && outlets.active.length >= 2,
      lockedOutletId,
      lockedBranchLabel: lockedOutletId ? (outlets.names[lockedOutletId] ?? 'Your branch') : null,
      tracksStock: tenant.tracksStock,
      bills: board.bills,
      marks: board.marks,
      payments: board.payments,
      recentExpenses: recent.expenses,
    }
  } catch (error) {
    // The details stay in the server log; the owner gets a plain sentence.
    console.error('[expenses] bills unavailable', { tenantId: tenant.id, error: error instanceof Error ? error.message : String(error) })
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">Expenses</h1>
        <ExpensesTabs tenantSlug={tenant.slug} active="bills" monthKey={monthKey} />
        <div role="alert" className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-border">
          <p className="text-[17px] font-extrabold text-wn-ink">We couldn’t load your bills.</p>
          <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-snug text-wn-stone">
            Something went wrong on our side. Reload the page to try again. Nothing you saved is lost.
          </p>
        </div>
      </div>
    )
  }

  return <BillsWorkspace data={data} />
}
