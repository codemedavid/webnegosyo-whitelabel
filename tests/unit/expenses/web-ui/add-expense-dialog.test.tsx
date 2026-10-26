/**
 * The add-expense dialog, keyboard-first: amount → category → ⌘Enter.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CATEGORIES, ELECTRICITY, LPG, OTHER, TENANT_SLUG } from './ui-fixtures'

const recordExpenseAction = jest.fn()
const voidExpenseAction = jest.fn()
const toastSuccess = jest.fn()
const refresh = jest.fn()
const uploadReceipts = jest.fn()
const listPayableDrawersAction = jest.fn()
const recordDrawerExpenseAction = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: jest.fn(), push: jest.fn() }) }))
jest.mock('@/components/admin/expenses/receipt-client', () => ({
  ...jest.requireActual('@/components/admin/expenses/receipt-client'),
  uploadReceipts: (...args: unknown[]) => uploadReceipts(...args),
}))

jest.mock('@/app/actions/expenses', () => ({
  recordExpenseAction: (...args: unknown[]) => recordExpenseAction(...args),
  listPayableDrawersAction: (...args: unknown[]) => listPayableDrawersAction(...args),
  recordDrawerExpenseAction: (...args: unknown[]) => recordDrawerExpenseAction(...args),
  voidExpenseAction: (...args: unknown[]) => voidExpenseAction(...args),
  replaceExpenseAction: jest.fn(),
  updateExpenseDetailsAction: jest.fn(),
  sortDrawerPayoutAction: jest.fn(),
  saveCategoryAction: jest.fn(),
  archiveCategoryAction: jest.fn(),
  saveSupplierAction: jest.fn(),
}))
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: (...args: unknown[]) => toastSuccess(...args), error: jest.fn() }),
}))

const TODAY = '2026-10-21'

async function renderDialog() {
  // next/jest does not hoist jest.mock above static imports: load the dialog after the mocks.
  const { AddExpenseDialog } = await import('@/components/admin/expenses/add-expense-dialog')
  return render(
    <AddExpenseDialog
      isOpen
      onOpenChange={jest.fn()}
      tenantSlug={TENANT_SLUG}
      categories={CATEGORIES}
      suppliers={[]}
      outlets={[]}
      isMultiBranch={false}
      recentExpenses={[]}
      today={TODAY}
    />,
  )
}

function amountInput(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Amount (required)' })
}

function pickCategory(text: string): void {
  const input = screen.getByRole('combobox', { name: /What was it for/ })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-21T04:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] })
  recordExpenseAction.mockReset()
  voidExpenseAction.mockReset()
  toastSuccess.mockReset()
  refresh.mockReset()
  uploadReceipts.mockReset()
  uploadReceipts.mockResolvedValue([])
  listPayableDrawersAction.mockReset()
  listPayableDrawersAction.mockResolvedValue({ ok: true, data: [] })
  recordDrawerExpenseAction.mockReset()
  recordDrawerExpenseAction.mockResolvedValue({ ok: true, data: { id: 'drawer-1' } })
  recordExpenseAction.mockImplementation(async (_slug: string, draft: { categoryId: string; amountCents: number }) => ({
    ok: true,
    data: { id: 'saved-1', ...draft },
  }))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('AddExpenseDialog', () => {
  it('reads a typed amount and puts it on the save button', async () => {
    await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '1250' } })

    expect(screen.getByRole('button', { name: 'Save ₱1,250' })).toBeInTheDocument()
    expect(screen.getByText('₱1,250.00 · 1,250 pesos')).toBeInTheDocument()
  })

  it('reads commas, the peso sign and centavos the same way', async () => {
    await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '₱1,250.50' } })

    expect(screen.getByRole('button', { name: 'Save ₱1,250.50' })).toBeInTheDocument()
    expect(screen.getByText('₱1,250.50 · 1,250 pesos and 50 centavos')).toBeInTheDocument()
  })

  it('refuses an amount it cannot read, with a sentence, and sends nothing', async () => {
    await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '12.345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Type the amount as a number, like 1,250 or 80.50.')).toBeInTheDocument()
    expect(recordExpenseAction).not.toHaveBeenCalled()
  })

  it('finds a category by its Filipino word: "kur" + Enter picks Electricity (Kuryente)', async () => {
    await renderDialog()

    pickCategory('kur')

    expect(screen.getByRole('combobox', { name: /What was it for/ })).toHaveValue(ELECTRICITY.name)
  })

  it('asks for a note when the category needs one (Other)', async () => {
    await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '500' } })
    pickCategory('oth')
    fireEvent.click(screen.getByRole('button', { name: 'Save ₱500' }))

    expect(await screen.findByText(`Add a short note for “${OTHER.name}” so you remember what it was.`)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Note/ })).toBeRequired()
    expect(recordExpenseAction).not.toHaveBeenCalled()
  })

  it('saves with ⌘Enter and sends the draft in centavos, dated today, from cash on hand', async () => {
    await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '1,250' } })
    pickCategory('lpg')
    fireEvent.keyDown(amountInput(), { key: 'Enter', metaKey: true })

    await waitFor(() => expect(recordExpenseAction).toHaveBeenCalledTimes(1))
    const [slug, draft] = recordExpenseAction.mock.calls[0]
    expect(slug).toBe(TENANT_SLUG)
    expect(draft).toMatchObject({
      amountCents: 125_000,
      categoryId: LPG.id,
      spentOn: TODAY,
      paidFrom: 'cash',
      outletId: null,
      note: null,
      isStockPurchase: false,
    })
    expect(draft.clientRequestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('also saves with Ctrl+Enter, then offers Undo and stays open for the next one', async () => {
    await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '1250' } })
    pickCategory('lpg')
    fireEvent.keyDown(amountInput(), { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    const [message, options] = toastSuccess.mock.calls[0]
    expect(message).toBe('Saved · Gas / LPG ₱1,250')
    expect(options.action.label).toBe('Undo')
    // Ready for the next entry: empty amount, a fresh button label.
    expect(amountInput()).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent('Saved · Gas / LPG ₱1,250')

    options.action.onClick()
    await waitFor(() => expect(voidExpenseAction).toHaveBeenCalledWith(TENANT_SLUG, { expenseId: 'saved-1', reason: 'Undo' }))
  })

  it('saves once when ⌘Enter is pressed twice before the first save answers', async () => {
    let answer: (value: unknown) => void = () => undefined
    recordExpenseAction.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '1250' } })
    pickCategory('lpg')
    fireEvent.keyDown(amountInput(), { key: 'Enter', metaKey: true })
    fireEvent.keyDown(amountInput(), { key: 'Enter', metaKey: true })
    answer({ ok: true, data: { id: 'saved-1' } })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(recordExpenseAction).toHaveBeenCalledTimes(1)
  })

  it('re-reads the book after a receipt is attached, so the row shows its paperclip', async () => {
    const { container } = await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '1250' } })
    pickCategory('lpg')
    const file = new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' })
    fireEvent.change(container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Save ₱1,250' }))

    await waitFor(() => expect(uploadReceipts).toHaveBeenCalledWith('saved-1', [file]))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('does not re-read the book when nothing was attached (the save already refreshed it)', async () => {
    await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '1250' } })
    pickCategory('lpg')
    fireEvent.click(screen.getByRole('button', { name: 'Save ₱1,250' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows the server’s refusal and keeps what was typed', async () => {
    recordExpenseAction.mockResolvedValueOnce({ ok: false, error: 'You don’t have access to expenses.' })
    await renderDialog()

    fireEvent.change(amountInput(), { target: { value: '80' } })
    pickCategory('lpg')
    fireEvent.click(screen.getByRole('button', { name: 'Save ₱80' }))

    expect(await screen.findByText('You don’t have access to expenses.')).toBeInTheDocument()
    expect(amountInput()).toHaveValue('80')
  })
})

describe("Take from a cashier's drawer", () => {
  const ben = { shiftId: 'shift-ben', drawerName: 'Cashier 1', staffName: 'Ben', isMine: false, outletId: null, openedAt: '2026-10-21T00:00:00Z' }
  const ana = { shiftId: 'shift-ana', drawerName: 'Cashier 2', staffName: 'Ana', isMine: false, outletId: null, openedAt: '2026-10-21T00:00:00Z' }

  it('offers no Cashier drawer when nobody is on a drawer this person may take from', async () => {
    await renderDialog()
    await waitFor(() => expect(listPayableDrawersAction).toHaveBeenCalledWith(TENANT_SLUG))
    expect(screen.queryByRole('radio', { name: 'Cashier drawer' })).not.toBeInTheDocument()
  })

  it('pays from the one open drawer: today, and through the drawer, not the book', async () => {
    // Arrange
    listPayableDrawersAction.mockResolvedValue({ ok: true, data: [ben] })
    await renderDialog()
    const drawerPill = await screen.findByRole('radio', { name: 'Cashier drawer' })

    // Act
    fireEvent.click(drawerPill)
    fireEvent.change(amountInput(), { target: { value: '300' } })
    pickCategory('LPG')
    fireEvent.keyDown(amountInput(), { key: 'Enter', metaKey: true })

    // Assert
    expect(screen.getByText('Cashier 1 · Ben')).toBeInTheDocument()
    expect(screen.getByLabelText('Date paid')).toBeDisabled()
    await waitFor(() => expect(recordDrawerExpenseAction).toHaveBeenCalled())
    expect(recordDrawerExpenseAction).toHaveBeenCalledWith(TENANT_SLUG, expect.objectContaining({ shiftId: 'shift-ben', amountCents: 30_000, categoryId: LPG.id }))
    expect(recordDrawerExpenseAction.mock.calls[0][1]).not.toHaveProperty('spentOn')
    expect(recordExpenseAction).not.toHaveBeenCalled()
  })

  it('asks which drawer when several are open, and a source pill goes back to the book', async () => {
    listPayableDrawersAction.mockResolvedValue({ ok: true, data: [ben, ana] })
    await renderDialog()
    fireEvent.click(await screen.findByRole('radio', { name: 'Cashier drawer' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Cashier 2 · Ana' }))
    expect(screen.getByRole('radio', { name: 'Cashier 2 · Ana' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: /GCash/ }))
    expect(screen.queryByRole('radio', { name: 'Cashier 2 · Ana' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Date paid')).not.toBeDisabled()
  })

  it('shows the drawer\'s refusal and keeps what was typed', async () => {
    listPayableDrawersAction.mockResolvedValue({ ok: true, data: [ben] })
    recordDrawerExpenseAction.mockResolvedValue({ ok: false, error: "That drawer's shift is already closed. Pay from an open drawer or pick another source." })
    await renderDialog()
    fireEvent.click(await screen.findByRole('radio', { name: 'Cashier drawer' }))
    fireEvent.change(amountInput(), { target: { value: '300' } })
    pickCategory('LPG')
    fireEvent.keyDown(amountInput(), { key: 'Enter', metaKey: true })

    expect(await screen.findByRole('alert')).toHaveTextContent("That drawer's shift is already closed")
    expect(amountInput()).toHaveValue('300')
  })
})
