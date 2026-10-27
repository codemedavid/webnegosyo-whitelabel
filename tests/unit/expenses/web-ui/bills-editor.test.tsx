/**
 * Add / Edit bill: presets, plain-sentence "how often" with the next three
 * dates, the shared engine's refusals in plain words, and never an
 * Ingredients category.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { applyPreset, billableCategories, blankEditor, draftOf, editorProblem, findPreset, previewDates } from '@/components/admin/expenses/bills/bill-editor-model'
import { BILL_CATEGORIES, NOW, RENT, RENT_BILL, RENT_BILL_ID, TODAY, WAGES } from './bills-fixtures'
import { ELECTRICITY, ICE, LPG, TENANT_SLUG } from './ui-fixtures'

const createBillAction = jest.fn()
const updateBillAction = jest.fn()
const toastSuccess = jest.fn()

jest.mock('@/app/actions/expense-bills', () => ({
  createBillAction: (...args: unknown[]) => createBillAction(...args),
  updateBillAction: (...args: unknown[]) => updateBillAction(...args),
  pauseBillAction: jest.fn(),
  resumeBillAction: jest.fn(),
  endBillAction: jest.fn(),
  markBillAction: jest.fn(),
  unmarkBillAction: jest.fn(),
  linkExpenseToBillAction: jest.fn(),
  unlinkExpenseFromBillAction: jest.fn(),
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
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: (...args: unknown[]) => toastSuccess(...args), error: jest.fn() }),
}))

const CATEGORIES_BY_ID = new Map(BILL_CATEGORIES.map((category) => [category.id, category]))

async function renderEditor(props: { bill?: typeof RENT_BILL | null; presetKey?: string | null } = {}) {
  // next/jest does not hoist jest.mock above static imports: load the dialog after the mocks.
  const { BillEditorDialog } = await import('@/components/admin/expenses/bills/bill-editor-dialog')
  const onOpenChange = jest.fn()
  render(
    <BillEditorDialog
      isOpen
      onOpenChange={onOpenChange}
      tenantSlug={TENANT_SLUG}
      bill={props.bill ?? null}
      presetKey={props.presetKey ?? null}
      categories={BILL_CATEGORIES}
      suppliers={[]}
      outlets={[]}
      isMultiBranch={false}
      lockedOutletId={null}
      lockedBranchLabel={null}
      recentExpenses={[]}
      payments={[]}
      today={TODAY}
    />,
  )
  return { onOpenChange }
}

function presetButton(name: string): HTMLElement {
  return within(screen.getByRole('group', { name: 'Start from' })).getByRole('button', { name })
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] })
  createBillAction.mockReset()
  updateBillAction.mockReset()
  toastSuccess.mockReset()
  createBillAction.mockImplementation(async (_slug: string, draft: object) => ({ ok: true, data: { id: 'new-bill', ...draft } }))
  updateBillAction.mockImplementation(async (_slug: string, input: { draft: object }) => ({ ok: true, data: { id: RENT_BILL_ID, ...input.draft } }))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('the editor model', () => {
  it('never offers an Ingredients category', () => {
    const offered = billableCategories(BILL_CATEGORIES).map((category) => category.id)

    expect(offered).not.toContain(ICE.id)
    expect(offered).toEqual(expect.arrayContaining([RENT.id, ELECTRICITY.id, LPG.id, WAGES.id]))
  })

  it('a preset picks its seeded category, rule, fixed / changes and reminder lead', () => {
    const sahod = applyPreset(blankEditor(TODAY), findPreset('sahod')!, BILL_CATEGORIES)

    expect(sahod).toMatchObject({ name: 'Sahod', categoryId: WAGES.id, repeat: 'twice_monthly', day: 15, secondDay: 'last', amountMode: 'fixed', remindDaysBefore: 3 })
    expect(previewDates(sahod, TODAY)).toEqual(['2026-10-31', '2026-11-15', '2026-11-30'])
  })

  it('refuses in the owner’s words, through the shared engine', () => {
    const ready = { ...applyPreset(blankEditor(TODAY), findPreset('rent')!, BILL_CATEGORIES), amountText: '15,000' }

    expect(editorProblem(ready, CATEGORIES_BY_ID, TODAY)).toBeNull()
    expect(editorProblem({ ...ready, name: '  ' }, CATEGORIES_BY_ID, TODAY)?.message).toBe('Give the bill a name.')
    expect(editorProblem({ ...ready, amountText: '' }, CATEGORIES_BY_ID, TODAY)?.field).toBe('amountCents')
    expect(editorProblem({ ...ready, categoryId: ICE.id }, CATEGORIES_BY_ID, TODAY)?.message).toBe(
      'Ingredients are counted when you receive stock, so they can’t be a bill.',
    )
    expect(editorProblem({ ...ready, repeat: 'after_days', everyDaysText: '0' }, CATEGORIES_BY_ID, TODAY)).toEqual({
      field: 'rule',
      message: 'Pick from 1 to 90 days.',
    })
    expect(editorProblem({ ...ready, startsOn: '2025-01-01' }, CATEGORIES_BY_ID, TODAY)?.message).toBe('Pick a start date within the last 400 days.')
    expect(editorProblem({ ...ready, name: 'x'.repeat(61) }, CATEGORIES_BY_ID, TODAY)?.message).toBe('Keep the name to 60 letters or fewer.')
  })

  it('sends a changing bill with no amount', () => {
    const lpg = applyPreset(blankEditor(TODAY), findPreset('lpg')!, BILL_CATEGORIES)

    expect(draftOf(lpg)).toMatchObject({ name: 'LPG', categoryId: LPG.id, amountCents: null, rule: { kind: 'after_days', every: 10 } })
  })
})

describe('BillEditorDialog', () => {
  it('a preset fills the form, shows the next three dates, and Add bill sends the draft', async () => {
    await renderEditor()

    fireEvent.click(presetButton('Rent'))

    expect(screen.getByLabelText('Name')).toHaveValue('Rent')
    expect(screen.getByRole('combobox', { name: /Category/ })).toHaveValue(RENT.name)
    expect(screen.getByLabelText('How often')).toHaveValue('monthly')
    expect(screen.getByLabelText('On the')).toHaveValue('1')
    expect(screen.getByLabelText('Remind me')).toHaveValue('3')
    expect(screen.getByText('Every month on the 1st')).toBeInTheDocument()
    expect(screen.getByText('Sun, Nov 1 · Tue, Dec 1 · Fri, Jan 1')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Amount (required)' }), { target: { value: '15000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add bill' }))

    await waitFor(() => expect(createBillAction).toHaveBeenCalledTimes(1))
    expect(createBillAction).toHaveBeenCalledWith(TENANT_SLUG, {
      name: 'Rent',
      categoryId: RENT.id,
      outletId: null,
      supplierId: null,
      paidToName: null,
      paidFrom: 'cash',
      amountCents: 1_500_000,
      rule: { kind: 'monthly', day: 1 },
      startsOn: TODAY,
      endsOn: null,
      remindDaysBefore: 3,
    })
  })

  it('updates the next dates as "how often" changes (twice a month: 15th and last day)', async () => {
    await renderEditor()

    fireEvent.change(screen.getByLabelText('How often'), { target: { value: 'twice_monthly' } })
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Second day'), { target: { value: 'last' } })

    expect(screen.getByText('Twice a month: 15th and last day')).toBeInTheDocument()
    expect(screen.getByText('Sat, Oct 31 · Sun, Nov 15 · Mon, Nov 30')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('How often'), { target: { value: 'every_2_weeks' } })
    fireEvent.change(screen.getByLabelText('On'), { target: { value: '2' } })
    expect(screen.getByText('Every 2 weeks on Tuesday')).toBeInTheDocument()
    expect(screen.getByText('Tue, Oct 27 · Tue, Nov 10 · Tue, Nov 24')).toBeInTheDocument()
  })

  it('refuses with a sentence next to the field and sends nothing', async () => {
    await renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Add bill' }))
    expect(await screen.findByText('Give the bill a name.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveFocus()

    fireEvent.click(presetButton('LPG'))
    fireEvent.change(screen.getByLabelText('About every how many days?'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add bill' }))

    expect(await screen.findByText('Pick from 1 to 90 days.')).toBeInTheDocument()
    expect(createBillAction).not.toHaveBeenCalled()
  })

  it('never offers an Ingredients category in the picker', async () => {
    await renderEditor()
    const picker = screen.getByRole('combobox', { name: /Category/ })

    fireEvent.change(picker, { target: { value: 'ice' } })
    expect(screen.queryByRole('option', { name: /Ice \(Yelo\)/ })).not.toBeInTheDocument()

    fireEvent.change(picker, { target: { value: 'kur' } })
    expect(screen.getByRole('option', { name: /Electricity \(Kuryente\)/ })).toBeInTheDocument()
  })

  it('shows the server’s sentence when the save is refused', async () => {
    createBillAction.mockResolvedValue({ ok: false, error: 'Only the owner can see expenses.' })
    await renderEditor({ presetKey: 'internet' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Amount (required)' }), { target: { value: '1699' } })
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Enter', metaKey: true })

    expect(await screen.findByRole('alert')).toHaveTextContent('Only the owner can see expenses.')
  })

  it('edits a bill: its values come in, and Save changes sends the bill id', async () => {
    const { onOpenChange } = await renderEditor({ bill: RENT_BILL })

    expect(screen.getByRole('heading', { name: 'Edit Rent' })).toBeInTheDocument()
    expect(screen.getByText(/^Changes apply from the next due date\./)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Start from' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Amount (required)' })).toHaveValue('15,000')
    expect(screen.getByLabelText('On the')).toHaveValue('5')

    fireEvent.change(screen.getByRole('textbox', { name: 'Amount (required)' }), { target: { value: '16,000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateBillAction).toHaveBeenCalledTimes(1))
    expect(updateBillAction.mock.calls[0][1]).toMatchObject({
      billId: RENT_BILL_ID,
      draft: { name: 'Rent', amountCents: 1_600_000, rule: { kind: 'monthly', day: 5 }, startsOn: '2026-10-01', paidFrom: 'gcash', paidToName: 'Aling Rosa' },
    })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
