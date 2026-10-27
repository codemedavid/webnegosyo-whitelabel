/**
 * The Expenses page's two tabs (`?tab=bills`, month kept), and how a bill
 * payment reads in the expense book: a "Bill" badge, and "Paid for: Rent ·
 * October" linking back to Bills to pay.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ExpensesTabs, expensesTabHref, readExpensesTab, readMonthParam } from '@/components/admin/expenses/expenses-tabs'
import { resolveMonth } from '@/components/admin/expenses/expense-format'
import type { ExpensesPageData } from '@/components/admin/expenses/expenses-page-data'
import { RENT, RENT_BILL_ID } from './bills-fixtures'
import { CATEGORIES, TENANT_ID, TENANT_SLUG, expense } from './ui-fixtures'

const refresh = jest.fn()
const unlinkExpenseFromBillAction = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: jest.fn(), push: jest.fn() }) }))
jest.mock('@/app/actions/expense-bills', () => ({
  createBillAction: jest.fn(),
  updateBillAction: jest.fn(),
  pauseBillAction: jest.fn(),
  resumeBillAction: jest.fn(),
  endBillAction: jest.fn(),
  markBillAction: jest.fn(),
  unmarkBillAction: jest.fn(),
  linkExpenseToBillAction: jest.fn(),
  unlinkExpenseFromBillAction: (...args: unknown[]) => unlinkExpenseFromBillAction(...args),
}))
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

beforeEach(() => {
  refresh.mockReset()
  unlinkExpenseFromBillAction.mockReset()
})

function pageData(
  month: string | null,
  billNames: Record<string, string> = { [RENT_BILL_ID]: 'Rent' },
  lateBillCount?: number,
): ExpensesPageData {
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
    ...(lateBillCount === undefined ? {} : { lateBillCount }),
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
  async function renderWorkspace(month: string | null, billNames?: Record<string, string>, lateBillCount?: number) {
    // next/jest does not hoist jest.mock above static imports: load the workspace after the mocks.
    const { ExpensesWorkspace } = await import('@/components/admin/expenses/expenses-workspace')
    return render(<ExpensesWorkspace data={pageData(month, billNames, lateBillCount)} />)
  }

  it('shows the late bills on the Bills to pay tab from the book too', async () => {
    await renderWorkspace(null, undefined, 2)

    expect(screen.getByRole('link', { name: /Bills to pay/ })).toHaveTextContent('2 late')
  })

  it('shows no late badge when nothing is late, or the bills could not be read', async () => {
    await renderWorkspace(null)

    expect(screen.getByRole('link', { name: 'Bills to pay' })).not.toHaveTextContent('late')
  })

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

  it('"Not for this bill" takes a wrong link off after a confirm, and refreshes', async () => {
    unlinkExpenseFromBillAction.mockResolvedValue({ ok: true, data: { ...rentPayment, billId: null, billDueOn: null } })
    await renderWorkspace(null)
    fireEvent.click(within(screen.getByText('Upa').closest('tr') as HTMLElement).getByRole('button', { name: /^Open/ }))

    fireEvent.click(await screen.findByRole('button', { name: 'Not for this bill' }))
    expect(unlinkExpenseFromBillAction).not.toHaveBeenCalled()
    expect(screen.getByText(/isn’t for Rent · October\?/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, take it off' }))

    await waitFor(() => expect(unlinkExpenseFromBillAction).toHaveBeenCalledWith(TENANT_SLUG, { expenseId: rentPayment.id }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('"Not for this bill" can be called off, and a refusal is shown in words', async () => {
    unlinkExpenseFromBillAction.mockResolvedValue({ ok: false, error: 'Only the owner can see expenses.' })
    await renderWorkspace(null)
    fireEvent.click(within(screen.getByText('Upa').closest('tr') as HTMLElement).getByRole('button', { name: /^Open/ }))

    fireEvent.click(await screen.findByRole('button', { name: 'Not for this bill' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('button', { name: 'Yes, take it off' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Not for this bill' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, take it off' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Only the owner can see expenses.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('offers no "Not for this bill" on an expense that pays no bill', async () => {
    await renderWorkspace(null)
    fireEvent.click(within(screen.getByText('Petron 11kg').closest('tr') as HTMLElement).getByRole('button', { name: /^Open/ }))

    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('Paid from')).toBeInTheDocument()
    expect(within(sheet).queryByText('Paid for')).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Not for this bill' })).not.toBeInTheDocument()
  })
})
