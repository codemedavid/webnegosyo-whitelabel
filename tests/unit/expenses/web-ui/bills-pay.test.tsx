/**
 * Paying a bill: Mark paid opens the ordinary Add expense dialog, pre-filled
 * and editable, and the saved expense carries the bill + the due date it
 * settles. "I already recorded it" files an existing expense instead.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { buildBillBoard, linkCandidates, paymentPrefill } from '@/components/admin/expenses/bills/bill-board-model'
import {
  INTERNET,
  KURYENTE_BILL,
  KURYENTE_BILL_ID,
  NOW,
  PAYMENTS,
  RENT,
  RENT_BILL,
  RENT_BILL_ID,
  TODAY,
  bill,
  billsPageData,
} from './bills-fixtures'
import { ELECTRICITY, TENANT_SLUG, expense } from './ui-fixtures'

const recordExpenseAction = jest.fn()
const linkExpenseToBillAction = jest.fn()
const toastSuccess = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), replace: jest.fn(), push: jest.fn() }) }))
jest.mock('@/app/actions/expenses', () => ({
  recordExpenseAction: (...args: unknown[]) => recordExpenseAction(...args),
  voidExpenseAction: jest.fn(),
  replaceExpenseAction: jest.fn(),
  replaceExpenseInBulkAction: jest.fn(),
  updateExpenseDetailsAction: jest.fn(),
  sortDrawerPayoutAction: jest.fn(),
  saveCategoryAction: jest.fn(),
  archiveCategoryAction: jest.fn(),
  saveSupplierAction: jest.fn(),
}))
jest.mock('@/app/actions/expense-bills', () => ({
  createBillAction: jest.fn(),
  updateBillAction: jest.fn(),
  pauseBillAction: jest.fn(),
  resumeBillAction: jest.fn(),
  endBillAction: jest.fn(),
  markBillAction: jest.fn(),
  unmarkBillAction: jest.fn(),
  linkExpenseToBillAction: (...args: unknown[]) => linkExpenseToBillAction(...args),
  unlinkExpenseFromBillAction: jest.fn(),
}))
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: (...args: unknown[]) => toastSuccess(...args), error: jest.fn() }),
}))

async function renderBoard(overrides: Parameters<typeof billsPageData>[0] = {}) {
  // next/jest does not hoist jest.mock above static imports: load the view after the mocks.
  const { BillsWorkspace } = await import('@/components/admin/expenses/bills/bills-workspace')
  return render(<BillsWorkspace data={billsPageData(overrides)} />)
}

function rowFor(name: string, dueOn: string) {
  const board = buildBillBoard({ bills: [RENT_BILL, KURYENTE_BILL], marks: [], payments: PAYMENTS, today: TODAY })
  const row = board.groups.flatMap((group) => group.rows).find((entry) => entry.bill.name === name && entry.occurrence.dueOn === dueOn)
  if (!row) throw new Error(`no row ${name} ${dueOn}`)
  return row
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] })
  recordExpenseAction.mockReset()
  linkExpenseToBillAction.mockReset()
  toastSuccess.mockReset()
  recordExpenseAction.mockImplementation(async (_slug: string, draft: { categoryId: string; amountCents: number }) => ({
    ok: true,
    data: { id: 'saved-1', ...draft },
  }))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('paymentPrefill', () => {
  it('fills a fixed bill’s amount, category, source, payee and note, dated today', () => {
    const { occurrence } = rowFor('Rent', '2026-10-05')

    const prefill = paymentPrefill(RENT_BILL, occurrence, PAYMENTS, TODAY)

    expect(prefill).toMatchObject({
      billId: RENT_BILL_ID,
      billDueOn: '2026-10-05',
      title: 'Pay Rent',
      amountChips: [],
      form: { amountText: '15,000', categoryId: RENT.id, paidFrom: 'gcash', paidToName: 'Aling Rosa', note: 'Rent', spentOn: TODAY },
    })
  })

  it('leaves a changing bill’s amount blank and offers Usual / Last time', () => {
    const { occurrence } = rowFor('Kuryente', '2026-10-24')

    const prefill = paymentPrefill(KURYENTE_BILL, occurrence, PAYMENTS, TODAY)

    expect(prefill.form.amountText).toBe('')
    expect(prefill.amountChips).toEqual([
      { label: 'Usual', cents: 620_000 },
      { label: 'Last time', cents: 640_000 },
    ])
  })

  it('pays the OLDEST of several late due dates first', () => {
    const { occurrence } = rowFor('Rent', '2026-10-05')
    const collapsed = { ...occurrence, lateCount: 2, lateDueOns: ['2026-09-05', '2026-10-05'] }

    expect(paymentPrefill(RENT_BILL, collapsed, PAYMENTS, TODAY).billDueOn).toBe('2026-09-05')
  })
})

describe('paying a branch bill', () => {
  const KATIPUNAN = { id: '20000000-0000-4000-8000-000000000001', name: 'Katipunan' }
  const MAGINHAWA = { id: '20000000-0000-4000-8000-000000000002', name: 'Maginhawa' }
  const branchRent = bill({ outletId: MAGINHAWA.id })
  const branchData = { outlets: [KATIPUNAN, MAGINHAWA], outletNames: { [KATIPUNAN.id]: KATIPUNAN.name, [MAGINHAWA.id]: MAGINHAWA.name }, isMultiBranch: true }

  it('files a branch bill’s payment on that branch; a store-wide bill leaves the branch to the form', () => {
    const { occurrence } = rowFor('Rent', '2026-10-05')

    expect(paymentPrefill(branchRent, occurrence, PAYMENTS, TODAY)).toMatchObject({ branchOutletId: MAGINHAWA.id, form: { outletId: MAGINHAWA.id } })
    const storeWide = paymentPrefill(RENT_BILL, occurrence, PAYMENTS, TODAY)
    expect(storeWide.branchOutletId).toBeNull()
    expect('outletId' in storeWide.form).toBe(false)
  })

  it('locks the branch to the bill’s, shown by name, and saves it there', async () => {
    await renderBoard({ ...branchData, bills: [branchRent] })

    fireEvent.click(within(screen.getByRole('region', { name: 'Late' })).getByRole('button', { name: 'Mark paid: Rent' }))
    expect(await screen.findByRole('heading', { name: 'Pay Rent' })).toBeInTheDocument()
    expect(screen.getByText('Maginhawa')).toBeInTheDocument()
    expect(screen.getByText('(locked)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save ₱15,000' }))
    await waitFor(() => expect(recordExpenseAction).toHaveBeenCalledTimes(1))
    expect(recordExpenseAction.mock.calls[0][1]).toMatchObject({ outletId: MAGINHAWA.id, billId: RENT_BILL_ID })
  })

  it('a store-wide bill keeps the branch the account records for', async () => {
    await renderBoard({ ...branchData, lockedOutletId: KATIPUNAN.id, lockedBranchLabel: 'Katipunan' })

    fireEvent.click(within(screen.getByRole('region', { name: 'Late' })).getByRole('button', { name: 'Mark paid: Rent' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save ₱15,000' }))

    await waitFor(() => expect(recordExpenseAction).toHaveBeenCalledTimes(1))
    expect(recordExpenseAction.mock.calls[0][1]).toMatchObject({ outletId: KATIPUNAN.id, billId: RENT_BILL_ID })
  })

  it('"I already recorded it" offers a branch bill only that branch’s expenses; a store-wide bill any branch’s', () => {
    const atMaginhawa = expense({ categoryId: RENT.id, spentOn: '2026-10-04', outletId: MAGINHAWA.id, note: 'Maginhawa upa' })
    const atKatipunan = expense({ categoryId: RENT.id, spentOn: '2026-10-05', outletId: KATIPUNAN.id, note: 'Katipunan upa' })
    const wholeStore = expense({ categoryId: RENT.id, spentOn: '2026-10-06', outletId: null, note: 'Store upa' })
    const all = [atMaginhawa, atKatipunan, wholeStore]

    expect(linkCandidates(all, branchRent, '2026-10-05').map((entry) => entry.note)).toEqual(['Maginhawa upa'])
    expect(linkCandidates(all, RENT_BILL, '2026-10-05').map((entry) => entry.note)).toEqual(['Katipunan upa', 'Store upa', 'Maginhawa upa'])
  })
})

describe('Mark paid', () => {
  it('opens "Pay Rent" pre-filled and saves an expense that carries the bill and its due date', async () => {
    await renderBoard()

    fireEvent.click(within(screen.getByRole('region', { name: 'Late' })).getByRole('button', { name: 'Mark paid: Rent' }))

    expect(await screen.findByRole('heading', { name: 'Pay Rent' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Amount (required)' })).toHaveValue('15,000')
    expect(screen.getByRole('combobox', { name: /What was it for/ })).toHaveValue(RENT.name)
    expect(screen.getByRole('textbox', { name: /^Note/ })).toHaveValue('Rent')
    expect(screen.getByLabelText('Date paid')).toHaveValue(TODAY)
    expect(screen.getByRole('radio', { name: 'GCash' })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Save ₱15,000' }))

    await waitFor(() => expect(recordExpenseAction).toHaveBeenCalledTimes(1))
    const [slug, draft] = recordExpenseAction.mock.calls[0]
    expect(slug).toBe(TENANT_SLUG)
    expect(draft).toMatchObject({
      amountCents: 1_500_000,
      categoryId: RENT.id,
      spentOn: TODAY,
      paidFrom: 'gcash',
      note: 'Rent',
      paidToName: 'Aling Rosa',
      billId: RENT_BILL_ID,
      billDueOn: '2026-10-05',
    })
    // One payment per due date: the dialog closes once it is saved.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Pay Rent' })).not.toBeInTheDocument())
  })

  it('a changing bill starts blank; one tap on "Usual" fills the estimate', async () => {
    await renderBoard()

    fireEvent.click(screen.getByRole('button', { name: 'Mark paid: Kuryente' }))
    expect(await screen.findByRole('heading', { name: 'Pay Kuryente' })).toBeInTheDocument()
    const amount = screen.getByRole('textbox', { name: 'Amount (required)' })
    expect(amount).toHaveValue('')

    fireEvent.click(within(screen.getByRole('group', { name: 'Amounts paid before' })).getByRole('button', { name: /^Usual/ }))
    expect(amount).toHaveValue('6,200')
    fireEvent.keyDown(amount, { key: 'Enter', metaKey: true })

    await waitFor(() => expect(recordExpenseAction).toHaveBeenCalledTimes(1))
    expect(recordExpenseAction.mock.calls[0][1]).toMatchObject({
      amountCents: 620_000,
      categoryId: ELECTRICITY.id,
      billId: KURYENTE_BILL_ID,
      billDueOn: '2026-10-24',
    })
  })
})

describe('I already recorded it', () => {
  const near = expense({ categoryId: RENT.id, spentOn: '2026-10-03', amountCents: 1_500_000, note: 'Upa Oct' })
  const nineDaysAfter = expense({ categoryId: RENT.id, spentOn: '2026-10-14', amountCents: 1_500_000, note: 'Upa late' })
  const tooEarly = expense({ categoryId: RENT.id, spentOn: '2026-09-24', note: 'Upa Sept' })
  const alreadyLinked = expense({ categoryId: RENT.id, spentOn: '2026-10-05', billId: RENT_BILL_ID, billDueOn: '2026-09-05' })
  const otherCategory = expense({ categoryId: INTERNET.id, spentOn: '2026-10-05' })
  const voided = expense({ categoryId: RENT.id, spentOn: '2026-10-06', status: 'void' })
  const EXPENSES = [tooEarly, nineDaysAfter, alreadyLinked, otherCategory, voided, near]

  it('offers only recorded, unlinked expenses of the same category within 10 days, closest first', () => {
    expect(linkCandidates(EXPENSES, RENT_BILL, '2026-10-05').map((entry) => entry.note)).toEqual(['Upa Oct', 'Upa late'])
  })

  it('links the chosen expense to the bill’s due date without adding a new one', async () => {
    linkExpenseToBillAction.mockResolvedValue({ ok: true, data: { ...near, billId: RENT_BILL_ID, billDueOn: '2026-10-05' } })
    const { BillLinkDialog } = await import('@/components/admin/expenses/bills/bill-link-dialog')
    const onClose = jest.fn()
    render(
      <BillLinkDialog
        target={{ bill: RENT_BILL, dueOn: '2026-10-05' }}
        onClose={onClose}
        tenantSlug={TENANT_SLUG}
        expenses={EXPENSES}
        supplierNames={new Map()}
        categoryName={() => RENT.name}
        today={TODAY}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Which one paid Rent?' })).toBeInTheDocument()
    const choices = screen.getAllByRole('button', { name: /^This one/ })
    expect(choices).toHaveLength(2)
    expect(screen.queryByText('Upa Sept')).not.toBeInTheDocument()

    fireEvent.click(choices[0])

    await waitFor(() =>
      expect(linkExpenseToBillAction).toHaveBeenCalledWith(TENANT_SLUG, { expenseId: near.id, billId: RENT_BILL_ID, dueOn: '2026-10-05' }),
    )
    expect(recordExpenseAction).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(toastSuccess.mock.calls[0][0]).toBe('Filed as Rent · October. Nothing new was added to Expenses.')
  })

  it('says what to do when nothing matches', async () => {
    const { BillLinkDialog } = await import('@/components/admin/expenses/bills/bill-link-dialog')
    render(
      <BillLinkDialog
        target={{ bill: RENT_BILL, dueOn: '2026-10-05' }}
        onClose={jest.fn()}
        tenantSlug={TENANT_SLUG}
        expenses={[tooEarly]}
        supplierNames={new Map()}
        categoryName={() => RENT.name}
        today={TODAY}
      />,
    )

    expect(screen.getByText(`No ${RENT.name} expense near Oct 5. Close this and use Mark paid to record it.`)).toBeInTheDocument()
  })
})
