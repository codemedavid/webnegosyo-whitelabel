import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The Expenses page's two tabs: the expense book and "Bills to pay"
 * (`?tab=bills`). Both are the same page, same access (the `expenses` key);
 * switching keeps the `?month=` the owner was looking at.
 */

export type ExpensesTab = 'expenses' | 'bills'

type Query = Record<string, string | string[] | undefined>

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || null
}

/** `?tab=bills` opens Bills to pay; anything else is the expense book. */
export function readExpensesTab(query: Query): ExpensesTab {
  return first(query.tab) === 'bills' ? 'bills' : 'expenses'
}

/** The `?month=` worth carrying across tabs (a readable `YYYY-MM`), else null. */
export function readMonthParam(query: Query): string | null {
  const month = first(query.month)
  return month && MONTH_KEY.test(month) ? month : null
}

export function expensesTabHref(tenantSlug: string, tab: ExpensesTab, monthKey: string | null): string {
  const params = new URLSearchParams()
  if (tab === 'bills') params.set('tab', 'bills')
  if (monthKey) params.set('month', monthKey)
  const query = params.toString()
  return `/${tenantSlug}/admin/expenses${query ? `?${query}` : ''}`
}

const TAB_LABELS: Readonly<Record<ExpensesTab, string>> = { expenses: 'Expenses', bills: 'Bills to pay' }

interface ExpensesTabsProps {
  tenantSlug: string
  active: ExpensesTab
  /** Carried across so switching back lands on the same month; null = this month. */
  monthKey: string | null
  /** Late bills, shown on the Bills tab so the owner sees them from the book. */
  lateCount?: number
}

export function ExpensesTabs({ tenantSlug, active, monthKey, lateCount = 0 }: ExpensesTabsProps) {
  return (
    <nav aria-label="Expenses sections" className="flex gap-1 border-b border-wn-line">
      {(['expenses', 'bills'] as const).map((tab) => {
        const isActive = tab === active
        return (
          <Link
            key={tab}
            href={expensesTabHref(tenantSlug, tab, monthKey)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[14.5px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2',
              isActive ? 'border-wn-ink text-wn-ink' : 'border-transparent text-wn-stone hover:text-wn-ink',
            )}
          >
            {TAB_LABELS[tab]}
            {tab === 'bills' && lateCount > 0 && (
              <span className="rounded-full bg-red-50 px-1.5 text-[12px] font-bold tabular-nums text-red-800 ring-1 ring-red-200">
                {lateCount} late
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
