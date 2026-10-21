/**
 * Links into the expense book from Profit's trust strip: ?add=, ?view=, ?category=.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { readInitialLink, resolveInitialLink, urlWithoutAdd } from '@/components/admin/expenses/expenses-deep-link'
import { resolveMonth } from '@/components/admin/expenses/expense-format'
import type { ExpensesPageData } from '@/components/admin/expenses/expenses-page-data'
import { CATEGORIES, ICE, LPG, TENANT_ID, TENANT_SLUG, expense, payout } from './ui-fixtures'

const replace = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn(), push: jest.fn() }),
}))
jest.mock('@/app/actions/expenses', () => ({
  recordExpenseAction: jest.fn(),
  voidExpenseAction: jest.fn(),
  replaceExpenseAction: jest.fn(),
  updateExpenseDetailsAction: jest.fn(),
  sortDrawerPayoutAction: jest.fn(),
  saveCategoryAction: jest.fn(),
  archiveCategoryAction: jest.fn(),
  saveSupplierAction: jest.fn(),
}))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }))

const TODAY = '2026-10-21'
const OPTIONS = { canAdd: true, canSortPayouts: true }

function pageData(initial: ExpensesPageData['initial']): ExpensesPageData {
  return {
    tenantId: TENANT_ID,
    tenantSlug: TENANT_SLUG,
    month: resolveMonth(null, TODAY),
    previousMonthKey: '2026-09',
    nextMonthKey: null,
    today: TODAY,
    categories: CATEGORIES,
    suppliers: [],
    outlets: [],
    outletNames: {},
    isMultiBranch: false,
    lockedOutletId: null,
    lockedBranchLabel: null,
    expenses: [
      expense({ categoryId: LPG.id, amountCents: 125_000, note: 'Petron 11kg' }),
      expense({ categoryId: ICE.id, amountCents: 12_000, note: 'Mang Ben ice' }),
    ],
    isTruncated: false,
    unsortedPayouts: [payout({ reason: 'yelo' })],
    tracksStock: false,
    canSortPayouts: true,
    initial,
  }
}

async function renderWorkspace(initial: ExpensesPageData['initial'], url: string) {
  window.history.replaceState(null, '', url)
  const { ExpensesWorkspace } = await import('@/components/admin/expenses/expenses-workspace')
  return render(<ExpensesWorkspace data={pageData(initial)} />)
}

beforeEach(() => replace.mockReset())

describe('reading the link', () => {
  it('turns ?add=1 into "open, no category" and ?add=<id> into that category', () => {
    expect(readInitialLink({ add: '1' })).toEqual({ add: '', view: null, categoryId: null })
    expect(readInitialLink({ add: ICE.id, view: 'unsorted', category: LPG.id })).toEqual({ add: ICE.id, view: 'unsorted', categoryId: LPG.id })
  })

  it('ignores what it does not know instead of failing', () => {
    const resolved = resolveInitialLink({ add: 'not-a-category', view: 'everything', categoryId: 'gone' }, CATEGORIES, OPTIONS)
    expect(resolved).toEqual({ isAddOpen: true, addCategoryId: null, view: 'all', categoryFilter: '__any__' })
  })

  it('never opens Add on a month that has not started', () => {
    expect(resolveInitialLink({ add: '', view: null, categoryId: null }, CATEGORIES, { ...OPTIONS, canAdd: false }).isAddOpen).toBe(false)
  })

  it('drops only `add` from the URL', () => {
    expect(urlWithoutAdd('/sukad/admin/expenses', `?month=2026-10&add=${ICE.id}&view=unsorted`)).toBe(
      '/sukad/admin/expenses?month=2026-10&view=unsorted',
    )
    expect(urlWithoutAdd('/sukad/admin/expenses', '?add=1')).toBe('/sukad/admin/expenses')
  })
})

describe('ExpensesWorkspace deep links', () => {
  it('?add=<categoryId> opens Add expense on that category, then cleans the URL', async () => {
    await renderWorkspace({ add: ICE.id, view: null, categoryId: null }, `/sukad/admin/expenses?month=2026-10&add=${ICE.id}`)

    expect(await screen.findByRole('heading', { name: 'New expense' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /What was it for/ })).toHaveValue(ICE.name)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sukad/admin/expenses?month=2026-10', { scroll: false }))
  })

  it('?add=1 opens it with no category', async () => {
    await renderWorkspace({ add: '', view: null, categoryId: null }, '/sukad/admin/expenses?add=1')

    expect(await screen.findByRole('heading', { name: 'New expense' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /What was it for/ })).toHaveValue('')
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sukad/admin/expenses', { scroll: false }))
  })

  it('?view=unsorted opens the Unsorted view, and leaves the URL alone', async () => {
    await renderWorkspace({ add: null, view: 'unsorted', categoryId: null }, '/sukad/admin/expenses?view=unsorted')

    expect(screen.getByRole('heading', { name: '1 drawer pay-out to sort' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unsorted/ })).toHaveAttribute('aria-pressed', 'true')
    expect(replace).not.toHaveBeenCalled()
  })

  it('?category=<id> applies the category filter', async () => {
    await renderWorkspace({ add: null, view: null, categoryId: LPG.id }, `/sukad/admin/expenses?category=${LPG.id}`)

    expect(screen.getByText('Petron 11kg')).toBeInTheDocument()
    expect(screen.queryByText('Mang Ben ice')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })
})
