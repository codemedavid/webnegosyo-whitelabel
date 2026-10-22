import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { getCachedTenantBySlug } from '@/lib/cache'
import { listCategories, listExpenses, listSuppliers, listUnsortedPayouts } from '@/lib/expenses/expense-service'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { createClient } from '@/lib/supabase/server'
import type { UnsortedPayout } from '@/lib/expenses/types'
import { expensesAccessFor } from '@/components/admin/expenses/expenses-access'
import { manilaToday, resolveMonth, shiftMonth } from '@/components/admin/expenses/expense-format'
import type { ExpensesOutlet, ExpensesPageData } from '@/components/admin/expenses/expenses-page-data'
import { ExpensesSkeleton } from '@/components/admin/expenses/expenses-skeleton'
import { ExpensesLoadFailed, ExpensesLocked } from '@/components/admin/expenses/expenses-states'
import { ExpensesWorkspace } from '@/components/admin/expenses/expenses-workspace'
import { readInitialLink } from '@/components/admin/expenses/expenses-deep-link'
import type { ExpensesInitialLink } from '@/components/admin/expenses/expenses-page-data'

interface ExpensesPageProps {
  params: Promise<{ tenant: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

interface OutletRow {
  id: string
  name: string
  is_active: boolean | null
}

const PAGE_TITLE = (
  <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">Expenses</h1>
)

/**
 * The expense book (plan §4.2, §5.4). Every read goes through the CALLER's
 * session client, so RLS decides what comes back: an `expenses` holder sees
 * the branches they reach, a branch-locked account only its own branch.
 * Expenses live in the platform database for every store, whatever its order
 * backend.
 */
export default async function ExpensesPage({ params, searchParams }: ExpensesPageProps) {
  const [{ tenant: tenantSlug }, query] = await Promise.all([params, searchParams])
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  const { appUser, roleError } = await getRequestCaller()
  // Fail closed: an errored account read is no account, never store-wide.
  const access = expensesAccessFor(roleError ? null : appUser, tenant.id)
  if (!access.ok) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        {PAGE_TITLE}
        <ExpensesLocked reason={access.reason} />
      </div>
    )
  }

  const requestedMonth = Array.isArray(query.month) ? query.month[0] : query.month
  return (
    <Suspense key={requestedMonth ?? 'current'} fallback={<ExpensesSkeleton />}>
      <ExpensesBook
        tenant={{
          id: tenant.id,
          slug: tenantSlug,
          isMultiBranch: isMultiBranchEnabled(tenant),
          tracksStock: (tenant as { inventory_enabled?: boolean | null }).inventory_enabled === true,
        }}
        lockedOutletId={access.scope.kind === 'branch' ? access.scope.outletId : null}
        requestedMonth={requestedMonth ?? null}
        initial={readInitialLink(query)}
      />
    </Suspense>
  )
}

interface ExpensesBookProps {
  tenant: { id: string; slug: string; isMultiBranch: boolean; tracksStock: boolean }
  lockedOutletId: string | null
  requestedMonth: string | null
  initial: ExpensesInitialLink
}

async function readOutlets(db: SupabaseClient, tenantId: string): Promise<OutletRow[]> {
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

async function readUnsorted(db: SupabaseClient, tenantId: string, from: string, to: string): Promise<UnsortedPayout[]> {
  try {
    return await listUnsortedPayouts(db, tenantId, from, to)
  } catch (error) {
    // Advisory list: the book still opens without it.
    console.error('[expenses] unsorted pay-outs unavailable', error instanceof Error ? error.message : error)
    return []
  }
}

async function ExpensesBook({ tenant, lockedOutletId, requestedMonth, initial }: ExpensesBookProps) {
  const today = manilaToday()
  const asked = resolveMonth(requestedMonth, today)
  const month = asked.isFuture ? resolveMonth(null, today) : asked
  const db = (await createClient()) as unknown as SupabaseClient

  let data: ExpensesPageData
  try {
    const [categories, suppliers, outletRows, list, unsorted] = await Promise.all([
      listCategories(db, tenant.id),
      listSuppliers(db, tenant.id),
      readOutlets(db, tenant.id),
      listExpenses(db, {
        tenantId: tenant.id,
        from: month.from,
        to: month.to,
        status: 'all',
        // A branch-locked account reads its own branch whatever else is asked.
        ...(lockedOutletId ? { outletId: lockedOutletId } : {}),
      }),
      readUnsorted(db, tenant.id, month.from, month.to),
    ])
    const activeOutlets: ExpensesOutlet[] = outletRows
      .filter((outlet) => outlet.is_active === true)
      .map((outlet) => ({ id: outlet.id, name: outlet.name }))
    const outletNames = Object.fromEntries(outletRows.map((outlet) => [outlet.id, outlet.name]))
    data = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      month,
      previousMonthKey: shiftMonth(month.key, -1),
      nextMonthKey: month.isCurrent ? null : shiftMonth(month.key, 1),
      today,
      categories,
      suppliers,
      outlets: activeOutlets,
      outletNames,
      isMultiBranch: tenant.isMultiBranch && activeOutlets.length >= 2,
      lockedOutletId,
      lockedBranchLabel: lockedOutletId ? (outletNames[lockedOutletId] ?? 'Your branch') : null,
      expenses: list.expenses,
      isTruncated: list.isTruncated,
      unsortedPayouts: lockedOutletId ? unsorted.filter((payout) => payout.outletId === lockedOutletId) : unsorted,
      tracksStock: tenant.tracksStock,
      canSortPayouts: true,
      initial,
    }
  } catch (error) {
    // The details stay in the server log; the owner gets a plain sentence (never Postgres text).
    console.error('[expenses] book unavailable', { tenantId: tenant.id, error: error instanceof Error ? error.message : String(error) })
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        {PAGE_TITLE}
        <ExpensesLoadFailed />
      </div>
    )
  }

  return <ExpensesWorkspace data={data} />
}
