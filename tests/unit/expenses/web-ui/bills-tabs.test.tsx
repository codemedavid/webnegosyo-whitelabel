/**
 * The Expenses page's two tabs (`?tab=bills`, month kept), and how a bill
 * payment reads in the expense book: a "Bill" badge, and "Paid for: Rent ·
 * October" linking back to Bills to pay.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { ExpensesTabs, expensesTabHref, readExpensesTab, readMonthParam } from '@/components/admin/expenses/expenses-tabs'
import { resolveMonth } from '@/components/admin/expenses/expense-format'
import type { ExpensesPageData } from '@/components/admin/expenses/expenses-page-data'
import { RENT, RENT_BILL_ID } from './bills-fixtures'
import { CATEGORIES, TENANT_ID, TENANT_SLUG, expense } from './ui-fixtures'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), replace: jest.fn(), push: jest.fn() }) }))
jest.mock('@/app/actions/expenses', () => ({
  recordExpenseAction: jest.fn(),
  voidExpenseAction: jest.fn(),
  replaceExpenseAction: jest.fn(),
  replaceExpenseInBulkAction: jest.fn(),
  updateExpenseDetailsAction: jest.fn(),
  sortDrawerPayoutAction: jest.fn(),
  saveCategoryAction: jest.fn(),
  archiveCategoryAction: jest.fn(),
  saveSupplierAction: jest.fn(),
}))
jest.mock('@/lib/expenses/read/expenses-read', () => ({
  ...jest.requireActual('@/lib/expenses/read/expenses-read'),
  // The sheet shows the clicked row while the full record loads; keep it loading.
  getExpense: () => new Promise(() => undefined),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

const TODAY = '2026-10-21'
const rentPayment = expense({ categoryId: RENT.id, amountCents: 1_500_000, note: 'Upa', billId: RENT_BILL_ID, billDueOn: '2026-10-05' })
const plain = expense({ note: 'Petron 11kg' })

function pageData(month: string | null, billNames: Record<string, string> = { [RENT_BILL_ID]: 'Rent' }): ExpensesPageData {
  return {
    tenantId: TENANT_ID,
    tenantSlug: TENANT_SLUG,
    month: resolveMonth(month, TODAY),
    previousMonthKey: '2026-09',
    nextMonthKey: null,
    today: TODAY,
    categories: [...CATEGORIES, RENT],
    suppliers: [],
    outlets: [],
    outletNames: {},
    isMultiBranch: false,
    lockedOutletId: null,
    lockedBranchLabel: null,
    expenses: [rentPayment, plain],
    billNames,
    isTruncated: false,
    unsortedPayouts: [],
    tracksStock: false,
    canSortPayouts: true,
    initial: { add: null, view: null, categoryId: null, spentOn: null },
  }
}

describe('tab URLs', () => {
  it('opens Bills to pay only for ?tab=bills', () => {
    expect(readExpensesTab({ tab: 'bills' })).toBe('bills')
    expect(readExpensesTab({ tab: ['bills', 'x'] })).toBe('bills')
    expect(readExpensesTab({})).toBe('expenses')
    expect(readExpensesTab({ tab: 'BILLS' })).toBe('expenses')
    expect(readExpensesTab({ tab: 'nope' })).toBe('expenses')
  })

  it('keeps a readable month across tabs and drops anything else', () => {
    expect(readMonthParam({ month: '2026-09' })).toBe('2026-09')
    expect(readMonthParam({ month: '2026-13' })).toBeNull()
    expect(readMonthParam({ month: 'last' })).toBeNull()
    expect(readMonthParam({})).toBeNull()

    expect(expensesTabHref(TENANT_SLUG, 'bills', '2026-09')).toBe('/sukad/admin/expenses?tab=bills&month=2026-09')
    expect(expensesTabHref(TENANT_SLUG, 'bills', null)).toBe('/sukad/admin/expenses?tab=bills')
    expect(expensesTabHref(TENANT_SLUG, 'expenses', '2026-09')).toBe('/sukad/admin/expenses?month=2026-09')
    expect(expensesTabHref(TENANT_SLUG, 'expenses', null)).toBe('/sukad/admin/expenses')
  })

  it('marks the open tab as the current page', () => {
    render(<ExpensesTabs tenantSlug={TENANT_SLUG} active="expenses" monthKey={null} />)

    const nav = within(screen.getByRole('navigation', { name: 'Expenses sections' }))
    expect(nav.getByRole('link', { name: 'Expenses' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Bills to pay' })).not.toHaveAttribute('aria-current')
  })
})

describe('the expense book', () => {
  async function renderWorkspace(month: string | null, billNames?: Record<string, string>) {
    // next/jest does not hoist jest.mock above static imports: load the workspace after the mocks.
    const { ExpensesWorkspace } = await import('@/components/admin/expenses/expenses-workspace')
    return render(<ExpensesWorkspace data={pageData(month, billNames)} />)
  }

  it('links to Bills to pay, keeping the month being looked at', async () => {
    await renderWorkspace('2026-09')

    expect(screen.getByRole('link', { name: 'Bills to pay' })).toHaveAttribute('href', '/sukad/admin/expenses?tab=bills&month=2026-09')
  })

  it('this month needs no month param', async () => {
    await renderWorkspace(null)

    expect(screen.getByRole('link', { name: 'Bills to pay' })).toHaveAttribute('href', '/sukad/admin/expenses?tab=bills')
  })

  it('badges a bill payment with "Bill", naming the bill for the tooltip and screen readers', async () => {
    await renderWorkspace(null)

    const rentRow = screen.getByText('Upa').closest('tr') as HTMLElement
    const badge = within(rentRow).getByText('Bill')
    expect(badge).toHaveAttribute('title', 'Pays the bill: Rent')
    expect(badge).toHaveTextContent('Bill: Rent')
    const plainRow = screen.getByText('Petron 11kg').closest('tr') as HTMLElement
    expect(within(plainRow).queryByText('Bill')).not.toBeInTheDocument()
  })

  it('still badges a bill payment when the bill names could not be read', async () => {
    await renderWorkspace(null, {})

    const rentRow = screen.getByText('Upa').closest('tr') as HTMLElement
    expect(within(rentRow).getByText('Bill')).toHaveAttribute('title', 'Pays a bill')
  })

  it('the detail sheet says what it paid for, linking to Bills to pay', async () => {
    await renderWorkspace(null)

    fireEvent.click(within(screen.getByText('Upa').closest('tr') as HTMLElement).getByRole('button', { name: /^Open/ }))

    const link = await screen.findByRole('link', { name: 'Rent · October' })
    expect(link).toHaveAttribute('href', '/sukad/admin/expenses?tab=bills')
    expect(screen.getByText('Paid for')).toBeInTheDocument()
  })
})
