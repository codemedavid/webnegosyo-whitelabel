'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react'
import { computeFlagsForAll } from '@/lib/expenses/flags'
import { summarize } from '@/lib/expenses/totals'
import type { Expense, ExpenseFlag } from '@/lib/expenses/types'
import { cn } from '@/lib/utils'
import { AddExpenseDialog } from './add-expense-dialog'
import { BulkRecategorizeDialog } from './bulk-recategorize-dialog'
import { CategoriesDialog } from './categories-dialog'
import { ExpenseDetailSheet } from './expense-detail-sheet'
import { formatPeso, pesoWords } from './expense-format'
import { EXPENSE_VIEWS, EXPENSE_VIEW_LABELS, NO_FILTERS, filterExpenses, hasActiveFilters, viewCounts, type ExpenseFilters, type ExpenseView } from './expense-list-model'
import { ExpensesFilterBar } from './expenses-filter-bar'
import { resolveInitialLink, urlWithoutAdd } from './expenses-deep-link'
import type { ExpensesPageData } from './expenses-page-data'
import { EmptyMonth, NoMatches, ProfitHint } from './expenses-states'
import { ExpensesTable } from './expenses-table'
import { ExportMenu, downloadSelectionCsv } from './export-menu'
import { UnsortedPayoutsPanel } from './unsorted-payouts-panel'

const HINT_STORAGE_KEY = 'wn-expenses-profit-hint-dismissed'

function readHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(HINT_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function storeHintDismissed(): void {
  try {
    window.localStorage.setItem(HINT_STORAGE_KEY, '1')
  } catch {
    // Private mode or blocked storage: the hint simply shows again next time.
  }
}

function monthHref(tenantSlug: string, key: string): string {
  return `/${tenantSlug}/admin/expenses?month=${key}`
}

/**
 * The expense book (plan §5.4): one hero number for the month, saved views,
 * filters, the day-grouped table, and every write behind a dialog or the
 * right-side sheet. The server page owns the reads; this owns what is shown.
 */
export function ExpensesWorkspace({ data }: { data: ExpensesPageData }) {
  const router = useRouter()
  // Links from other screens (Profit's trust strip) decide where the book opens.
  const [link] = useState(() =>
    resolveInitialLink(data.initial, data.categories, { canAdd: !data.month.isFuture, canSortPayouts: data.canSortPayouts, today: data.today }),
  )
  const [view, setView] = useState<ExpenseView>(link.view)
  const [filters, setFilters] = useState<ExpenseFilters>({ ...NO_FILTERS, categoryId: link.categoryFilter })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isAdding, setIsAdding] = useState(link.isAddOpen)
  const [addCategoryId, setAddCategoryId] = useState<string | null>(link.addCategoryId)
  const [addSpentOn, setAddSpentOn] = useState<string | null>(link.addSpentOn)
  const [fixing, setFixing] = useState<Expense | null>(null)
  const [openExpense, setOpenExpense] = useState<Expense | null>(null)
  const [isEditingCategories, setIsEditingCategories] = useState(false)
  const [isBulkMoving, setIsBulkMoving] = useState(false)
  const [isHintDismissed, setIsHintDismissed] = useState(true)

  useEffect(() => setIsHintDismissed(readHintDismissed()), [])

  // `add` is one-shot: drop it from the URL so a refresh doesn't reopen the dialog.
  const hasAddParam = data.initial.add !== null
  useEffect(() => {
    if (!hasAddParam) return
    router.replace(urlWithoutAdd(window.location.pathname, window.location.search), { scroll: false })
  }, [hasAddParam, router])

  const categoriesById = useMemo(() => new Map(data.categories.map((category) => [category.id, category])), [data.categories])
  const outletNames = useMemo(() => new Map(Object.entries(data.outletNames)), [data.outletNames])
  const flagsById = useMemo(() => {
    const flags = computeFlagsForAll(data.expenses, { categories: data.categories })
    return new Map<string, readonly ExpenseFlag[]>(Object.entries(flags))
  }, [data.expenses, data.categories])
  const supplierNames = useMemo(() => new Map(data.suppliers.map((supplier) => [supplier.id, supplier.name])), [data.suppliers])
  const context = useMemo(() => ({ categoriesById, flagsById, supplierNames }), [categoriesById, flagsById, supplierNames])

  const summary = useMemo(() => summarize(data.expenses, data.categories), [data.expenses, data.categories])
  const spentCents = summary.operatingCents + summary.capexCents
  const counts = viewCounts(data.expenses, data.unsortedPayouts.length, context)
  const rows = useMemo(() => filterExpenses(data.expenses, view, filters, context), [data.expenses, view, filters, context])
  const selected = data.expenses.filter((expense) => selectedIds.has(expense.id) && expense.status === 'recorded')

  const changeView = useCallback((next: ExpenseView) => {
    setView(next)
    setSelectedIds(new Set())
  }, [])

  function openFix(expense: Expense): void {
    setOpenExpense(null)
    setFixing(expense)
  }

  function exportSelected(): void {
    downloadSelectionCsv({
      expenses: selected,
      categories: data.categories,
      suppliers: data.suppliers,
      outlets: Object.entries(data.outletNames).map(([id, name]) => ({ id, name })),
      fileName: `expenses-${data.tenantSlug}-${data.month.key}-selected.csv`,
    })
  }

  const isEmptyMonth = data.expenses.length === 0
  const canAdd = !data.month.isFuture
  const headline = data.month.isCurrent ? 'Spent this month' : `Spent in ${data.month.monthName}`

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">Expenses</h1>
            <p className="mt-1.5 max-w-xl text-[14px] leading-snug text-wn-stone">
              Every peso that leaves the store, in one book. Fix with a reason, never erase.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditingCategories(true)}
              aria-label="Categories"
              title="Categories"
              className="grid size-11 place-items-center rounded-full bg-white text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
            >
              <Settings2 className="size-[18px]" aria-hidden />
            </button>
            <ExportMenu
              range={{ tenantId: data.tenantId, from: data.month.from, to: data.month.to, branch: filters.branch }}
              monthLabel={data.month.label}
            />
            {canAdd && (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-wn-ink px-5 text-[14.5px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2"
              >
                <Plus className="size-4" aria-hidden />
                Add expense
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-white px-5 py-4 ring-1 ring-border">
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-wn-stone">
              {headline}
              <span className="font-normal"> · Gastos</span>
            </p>
            <p
              className="mt-1 text-[40px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-wn-ink"
              aria-label={`${headline}: ${pesoWords(spentCents)}`}
            >
              {formatPeso(spentCents)}
            </p>
            <p className="mt-2 text-[13px] tabular-nums text-wn-stone">
              {summary.count} {summary.count === 1 ? 'entry' : 'entries'}
              {summary.capexCents > 0 && ` · includes ${formatPeso(summary.capexCents)} big purchases`}
              {summary.notExpenseCents > 0 && ` · ${formatPeso(summary.notExpenseCents)} moved that isn’t an expense`}
            </p>
          </div>
          <nav aria-label="Month" className="flex items-center gap-1">
            <Link
              href={monthHref(data.tenantSlug, data.previousMonthKey)}
              aria-label="Previous month"
              className="grid size-11 place-items-center rounded-full text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </Link>
            <span className="min-w-36 text-center text-[15px] font-bold text-wn-ink" aria-current="date">
              {data.month.label}
            </span>
            {data.nextMonthKey ? (
              <Link
                href={monthHref(data.tenantSlug, data.nextMonthKey)}
                aria-label="Next month"
                className="grid size-11 place-items-center rounded-full text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
              >
                <ChevronRight className="size-5" aria-hidden />
              </Link>
            ) : (
              <span aria-hidden className="grid size-11 place-items-center text-wn-line">
                <ChevronRight className="size-5" />
              </span>
            )}
          </nav>
        </div>
      </header>

      {isEmptyMonth && !isHintDismissed && (
        <ProfitHint
          onDismiss={() => {
            storeHintDismissed()
            setIsHintDismissed(true)
          }}
        />
      )}

      {data.isTruncated && (
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] text-amber-950 ring-1 ring-amber-200">
          This month has more entries than one page can hold, so some are not shown. Use Export for the full list.
        </p>
      )}

      {counts.unsorted > 0 && view !== 'unsorted' && data.canSortPayouts && (
        <button
          type="button"
          onClick={() => changeView('unsorted')}
          className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 text-left text-[14px] font-semibold text-amber-950 ring-1 ring-amber-200 outline-none hover:ring-amber-400 focus-visible:ring-2 focus-visible:ring-amber-700"
        >
          <span>
            {counts.unsorted} drawer pay-out{counts.unsorted === 1 ? '' : 's'} to sort
            <span className="font-normal"> · Profit can’t count them until they have a category</span>
          </span>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </button>
      )}

      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Views" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-1.5">
            {EXPENSE_VIEWS.filter((entry) => entry !== 'unsorted' || data.canSortPayouts).map((entry) => {
              const isActive = entry === view
              const count = counts[entry]
              return (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => changeView(entry)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2',
                    isActive ? 'bg-wn-ink text-white' : 'bg-white text-wn-ink ring-1 ring-border hover:ring-wn-ink',
                  )}
                >
                  {EXPENSE_VIEW_LABELS[entry]}
                  {entry !== 'all' && count > 0 && (
                    <span className={cn('tabular-nums', isActive ? 'text-white/75' : 'text-wn-stone')}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
        {view !== 'unsorted' && (
          <ExpensesFilterBar
            filters={filters}
            onChange={(next) => {
              setFilters(next)
              setSelectedIds(new Set())
            }}
            categories={data.categories}
            outlets={data.outlets}
            showBranch={data.isMultiBranch && !data.lockedOutletId}
          />
        )}
      </div>

      {selected.length > 0 && view !== 'unsorted' && (
        <div
          role="region"
          aria-label="Selected expenses"
          className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-xl bg-wn-ink px-4 py-2.5 text-white shadow-[0_8px_24px_-12px_rgb(29_24_21/0.6)]"
        >
          <p className="mr-auto text-[14px] font-semibold tabular-nums">
            {selected.length} selected · {formatPeso(selected.reduce((sum, expense) => sum + expense.amountCents, 0))}
          </p>
          <button type="button" onClick={() => setIsBulkMoving(true)} className={BAR_BUTTON}>
            Change category
          </button>
          <button type="button" onClick={exportSelected} className={BAR_BUTTON}>
            Export selected
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className={cn(BAR_BUTTON, 'bg-transparent ring-white/30')}>
            Clear
          </button>
        </div>
      )}

      {view === 'unsorted' ? (
        <UnsortedPayoutsPanel
          tenantSlug={data.tenantSlug}
          payouts={data.unsortedPayouts}
          categories={data.categories}
          recentExpenses={data.expenses}
          outletNames={outletNames}
          isMultiBranch={data.isMultiBranch}
          today={data.today}
        />
      ) : isEmptyMonth ? (
        <EmptyMonth monthName={data.month.monthName} isCurrent={data.month.isCurrent} onAdd={canAdd ? () => setIsAdding(true) : undefined} />
      ) : rows.length === 0 ? (
        <NoMatches
          onClear={
            hasActiveFilters(filters) || view !== 'all'
              ? () => {
                  setFilters(NO_FILTERS)
                  changeView('all')
                }
              : undefined
          }
        >
          {view === 'needs_look' ? 'Nothing needs a look this month.' : view === 'no_receipt' ? 'Every expense here has a receipt.' : undefined}
        </NoMatches>
      ) : (
        <ExpensesTable
          key={`${view}-${filters.categoryId}-${filters.paidFrom}-${filters.branch}-${filters.search}`}
          rows={rows}
          categoriesById={categoriesById}
          outletNames={outletNames}
          supplierNames={supplierNames}
          flagsById={flagsById}
          today={data.today}
          isMultiBranch={data.isMultiBranch}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onOpen={setOpenExpense}
        />
      )}

      <AddExpenseDialog
        isOpen={isAdding || fixing !== null}
        onOpenChange={(isOpen) => {
          if (isOpen) return
          setIsAdding(false)
          setAddCategoryId(null)
          setAddSpentOn(null)
          setFixing(null)
        }}
        tenantSlug={data.tenantSlug}
        categories={data.categories}
        suppliers={data.suppliers}
        outlets={data.outlets}
        isMultiBranch={data.isMultiBranch}
        lockedOutletId={data.lockedOutletId}
        lockedBranchLabel={data.lockedBranchLabel}
        recentExpenses={data.expenses}
        today={data.today}
        tracksStock={data.tracksStock}
        fixing={fixing}
        initialCategoryId={addCategoryId}
        initialSpentOn={addSpentOn}
      />

      <ExpenseDetailSheet
        expense={openExpense}
        onClose={() => setOpenExpense(null)}
        tenantId={data.tenantId}
        tenantSlug={data.tenantSlug}
        categoriesById={categoriesById}
        suppliers={data.suppliers}
        outletNames={outletNames}
        isMultiBranch={data.isMultiBranch}
        flagsById={flagsById}
        tracksStock={data.tracksStock}
        onFix={openFix}
      />

      {isEditingCategories && (
        <CategoriesDialog isOpen onOpenChange={setIsEditingCategories} tenantSlug={data.tenantSlug} categories={data.categories} />
      )}

      {isBulkMoving && (
        <BulkRecategorizeDialog
          isOpen
          onOpenChange={setIsBulkMoving}
          tenantSlug={data.tenantSlug}
          expenses={selected}
          categories={data.categories}
          recentExpenses={data.expenses}
          onDone={(failedIds) => setSelectedIds(new Set(failedIds))}
        />
      )}
    </div>
  )
}

const BAR_BUTTON =
  'inline-flex min-h-10 items-center rounded-full bg-white/10 px-4 text-[13.5px] font-bold text-white ring-1 ring-white/20 outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white'
