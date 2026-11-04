/**
 * Bills to pay: the board's groups, its "still to pay" line, and the words on
 * each row (due pill + amount). The engine decides states; the board only
 * groups and words them.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  amountWords,
  buildBillBoard,
  dueWords,
  lateBillCount,
  lateCountWords,
  payDueOn,
  snoozeDueOns,
  summaryWords,
  type BoardInput,
} from '@/components/admin/expenses/bills/bill-board-model'
import type { Occurrence } from '@/lib/expenses/bill-schedule'
import {
  INTERNET_BILL,
  INTERNET_BILL_ID,
  KURYENTE_BILL,
  KURYENTE_BILL_ID,
  PAYMENTS,
  RENT_BILL,
  RENT_BILL_ID,
  TODAY,
  bill,
  billsPageData,
} from './bills-fixtures'
import { TENANT_SLUG } from './ui-fixtures'

const markBillAction = jest.fn()
const pauseBillAction = jest.fn()
const unmarkBillAction = jest.fn()
const toastSuccess = jest.fn()

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
jest.mock('@/app/actions/expense-bills', () => ({
  createBillAction: jest.fn(),
  updateBillAction: jest.fn(),
  pauseBillAction: (...args: unknown[]) => pauseBillAction(...args),
  resumeBillAction: jest.fn(),
  endBillAction: jest.fn(),
  markBillAction: (...args: unknown[]) => markBillAction(...args),
  unmarkBillAction: (...args: unknown[]) => unmarkBillAction(...args),
  linkExpenseToBillAction: jest.fn(),
  unlinkExpenseFromBillAction: jest.fn(),
}))
jest.mock('sonner', () => ({
  toast: Object.assign(jest.fn(), { success: (...args: unknown[]) => toastSuccess(...args), error: jest.fn() }),
}))

const INPUT: BoardInput = { bills: [RENT_BILL, KURYENTE_BILL, INTERNET_BILL], marks: [], payments: PAYMENTS, today: TODAY }

async function renderBoard(overrides: Parameters<typeof billsPageData>[0] = {}) {
  // next/jest does not hoist jest.mock above static imports: load the view after the mocks.
  const { BillsWorkspace } = await import('@/components/admin/expenses/bills/bills-workspace')
  return render(<BillsWorkspace data={billsPageData(overrides)} />)
}

beforeEach(() => {
  markBillAction.mockReset()
  pauseBillAction.mockReset()
  unmarkBillAction.mockReset()
  toastSuccess.mockReset()
})

describe('buildBillBoard', () => {
  it('sorts every bill into Late / This week / Later / Paid this month', () => {
    const board = buildBillBoard(INPUT)

    const shape = board.groups.map((group) => [group.label, group.rows.map((row) => `${row.bill.name} ${row.occurrence.dueOn}`)])
    expect(shape).toEqual([
      ['Late', ['Rent 2026-10-05']],
      ['This week', ['Kuryente 2026-10-24']],
      ['Later', ['Rent 2026-11-05', 'Internet 2026-11-15']],
      ['Paid this month', ['Internet 2026-10-15']],
    ])
  })

  it('counts late + this month’s unpaid in still-to-pay; next month waits', () => {
    const { summary } = buildBillBoard(INPUT)

    // ₱15,000 rent (late) + about ₱6,200 kuryente (average of ₱6,000 and ₱6,400).
    expect(summary).toEqual({ cents: 2_120_000, count: 2, hasEstimate: true })
    expect(summaryWords(summary, TODAY)).toBe('about ₱21,200 still to pay in October · 2 bills')
  })

  it('says it plainly when everything is paid, and without "about" when every amount is fixed', () => {
    expect(summaryWords({ cents: 0, count: 0, hasEstimate: false }, TODAY)).toBe('Nothing left to pay in October')
    expect(summaryWords({ cents: 3_920_000, count: 3, hasEstimate: false }, TODAY)).toBe('₱39,200 still to pay in October · 3 bills')
  })

  it('keeps a yearly bill whose next date is past the horizon on the board, under Later', () => {
    const permit = bill({ id: '10000000-0000-4000-8000-000000000009', name: 'Business permit', rule: { kind: 'months', every: 12, day: 20 }, startsOn: '2026-01-01' })

    const board = buildBillBoard({ ...INPUT, bills: [permit] })

    expect(board.groups).toHaveLength(1)
    expect(board.groups[0].label).toBe('Later')
    expect(board.groups[0].rows[0].occurrence.dueOn).toBe('2027-01-20')
  })

  it('lists paused and stopped bills apart, with nothing to pay', () => {
    const paused = bill({ status: 'paused' })
    const stopped = bill({ id: KURYENTE_BILL_ID, name: 'Old rent', status: 'ended' })

    const board = buildBillBoard({ ...INPUT, bills: [paused, stopped] })

    expect(board.groups).toEqual([])
    expect(board.paused.map((entry) => entry.name)).toEqual(['Rent'])
    expect(board.stopped.map((entry) => entry.name)).toEqual(['Old rent'])
    expect(board.summary.count).toBe(0)
  })

  it('a bill paused until a later day shows only under Paused: no due dates, nothing to pay', () => {
    const paused = bill({ status: 'paused', pausedUntil: '2026-11-01' })

    const board = buildBillBoard({ ...INPUT, bills: [paused] })

    expect(board.groups).toEqual([])
    expect(board.paused.map((entry) => entry.name)).toEqual(['Rent'])
    expect(board.summary).toEqual({ cents: 0, count: 0, hasEstimate: false })
    expect(lateBillCount({ ...INPUT, bills: [paused] })).toBe(0)
  })

  it('once its resume day comes, a paused bill is back on the board and no longer listed as paused', () => {
    for (const pausedUntil of ['2026-10-20', TODAY]) {
      const lapsed = bill({ status: 'paused', pausedUntil })

      const board = buildBillBoard({ ...INPUT, bills: [lapsed] })

      expect(board.paused).toEqual([])
      expect(board.groups.map((group) => [group.label, group.rows.map((row) => row.occurrence.dueOn)])).toEqual([['Later', ['2026-11-05']]])
    }
  })

  it('a paused bill still shows what it was paid this month', () => {
    const paused = bill({ id: INTERNET_BILL_ID, name: 'Internet', status: 'paused', pausedUntil: null, rule: { kind: 'monthly', day: 15 } })

    const board = buildBillBoard({ ...INPUT, bills: [paused] })

    expect(board.groups.map((group) => [group.id, group.rows.map((row) => row.occurrence.state)])).toEqual([['paid', ['paid']]])
    expect(board.paused.map((entry) => entry.name)).toEqual(['Internet'])
  })

  it('"Remind me tomorrow" on several late months folds them back into ONE row, like the late row they were', () => {
    const rent = bill({ startsOn: '2026-08-01' })
    const lateMonths = ['2026-08-05', '2026-09-05', '2026-10-05']
    const marks = lateMonths.map((dueOn) => ({ billId: RENT_BILL_ID, dueOn, kind: 'snoozed' as const, snoozedUntil: '2026-10-23' }))

    const board = buildBillBoard({ bills: [rent], marks, payments: [], today: TODAY })

    const rows = board.groups.flatMap((group) => group.rows)
    expect(rows).toHaveLength(2)
    const [snoozed] = rows.filter((row) => row.occurrence.state === 'snoozed')
    expect(snoozed.occurrence).toMatchObject({ dueOn: '2026-10-05', lateCount: 3, lateDueOns: lateMonths, snoozedUntil: '2026-10-23' })
    expect(lateCountWords(snoozed.occurrence)).toBe('3 payments still open')
    expect(amountWords(snoozed.occurrence)).toBe('₱45,000')
    expect(payDueOn(snoozed.occurrence)).toBe('2026-08-05')
    expect(snoozeDueOns(snoozed.occurrence)).toEqual(lateMonths)
    expect(board.summary).toEqual({ cents: 4_500_000, count: 3, hasEstimate: false })
  })

  it('counts late bills the way the Late group shows them', () => {
    expect(lateBillCount(INPUT)).toBe(1)
    expect(lateBillCount({ ...INPUT, bills: [KURYENTE_BILL, INTERNET_BILL] })).toBe(0)
  })
})

describe('row words', () => {
  const base: Occurrence = {
    billId: RENT_BILL_ID,
    dueOn: TODAY,
    state: 'due_today',
    amountCents: 620_000,
    isEstimate: true,
    payment: null,
    daysLate: 0,
    lateCount: 0,
    lateDueOns: [],
    snoozedUntil: null,
  }

  it('words the due pill and gives it a tone, never colour alone', () => {
    expect(dueWords({ ...base, state: 'late', dueOn: '2026-10-20', daysLate: 2 }, TODAY)).toEqual({ text: '2 days late', tone: 'late' })
    expect(dueWords(base, TODAY)).toEqual({ text: 'Due today', tone: 'soon' })
    expect(dueWords({ ...base, state: 'due_soon', dueOn: '2026-10-23' }, TODAY).text).toBe('Due tomorrow')
    expect(dueWords({ ...base, state: 'due_soon', dueOn: '2026-10-24' }, TODAY).text).toBe('Due Sat')
    expect(dueWords({ ...base, state: 'upcoming', dueOn: '2026-11-05' }, TODAY).text).toBe('Due Nov 5')
    expect(dueWords({ ...base, state: 'snoozed', dueOn: '2026-10-20', snoozedUntil: '2026-10-23' }, TODAY).text).toBe('Reminding you tomorrow')
    expect(dueWords({ ...base, state: 'skipped' }, TODAY)).toEqual({ text: 'Nothing to pay', tone: 'calm' })
  })

  it('an "about every N days" bill last marked long ago says "Not marked in a while", not "97 days late"', () => {
    const longLate = { ...base, state: 'late' as const, dueOn: '2026-07-17', daysLate: 97 }

    expect(dueWords(longLate, TODAY, 'after_days')).toEqual({ text: 'Not marked in a while', tone: 'late' })
    expect(dueWords({ ...longLate, daysLate: 60 }, TODAY, 'after_days').text).toBe('60 days late')
    expect(dueWords(longLate, TODAY, 'monthly').text).toBe('97 days late')
  })

  it('says "about" for an estimate and multiplies a collapsed late row', () => {
    expect(amountWords(base)).toBe('about ₱6,200')
    expect(amountWords({ ...base, isEstimate: false, amountCents: 1_500_000, state: 'late', lateCount: 2 })).toBe('₱30,000')
    expect(amountWords({ ...base, amountCents: null })).toBe('Amount changes')
  })
})

describe('BillsWorkspace', () => {
  it('shows the still-to-pay line and every group, with Paid this month folded', async () => {
    await renderBoard()

    expect(screen.getByRole('region', { name: 'Still to pay' })).toHaveTextContent('about ₱21,200 still to pay in October · 2 bills')
    expect(screen.getByRole('button', { name: /^Late 1/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /^This week 1/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /^Later 2/ })).toHaveAttribute('aria-expanded', 'true')
    const paid = screen.getByRole('button', { name: /^Paid this month 1/ })
    expect(paid).toHaveAttribute('aria-expanded', 'false')

    const late = within(screen.getByRole('region', { name: 'Late' }))
    expect(late.getByText('Rent')).toBeInTheDocument()
    expect(late.getByText('Every month on the 5th')).toBeInTheDocument()
    expect(late.getByText('17 days late')).toBeInTheDocument()
    expect(late.getByText('₱15,000')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'This week' })).getByText('about ₱6,200')).toBeInTheDocument()

    fireEvent.click(paid)
    const paidRows = within(screen.getByRole('region', { name: 'Paid this month' }))
    expect(paidRows.getByText('Paid Oct 14')).toBeInTheDocument()
    expect(paidRows.queryByRole('button', { name: /Mark paid/ })).not.toBeInTheDocument()
  })

  it('shows the late count on the Bills to pay tab', async () => {
    await renderBoard({ monthKey: '2026-09' })

    const bills = screen.getByRole('link', { name: /Bills to pay/ })
    expect(bills).toHaveAttribute('aria-current', 'page')
    expect(bills).toHaveTextContent('1 late')
    expect(screen.getByRole('link', { name: 'Expenses' })).toHaveAttribute('href', `/${TENANT_SLUG}/admin/expenses?month=2026-09`)
  })

  it('"Nothing to pay this time" marks the oldest open due date and offers Undo', async () => {
    markBillAction.mockResolvedValue({ ok: true, data: { billId: RENT_BILL_ID, dueOn: '2026-10-05', kind: 'skipped', snoozedUntil: null } })
    unmarkBillAction.mockResolvedValue({ ok: true, data: null })
    await renderBoard()

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'More for Rent' })[0], { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Nothing to pay this time' }))

    await waitFor(() => expect(markBillAction).toHaveBeenCalledWith(TENANT_SLUG, { billId: RENT_BILL_ID, dueOn: '2026-10-05', kind: 'skipped' }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    const [message, options] = toastSuccess.mock.calls[0]
    expect(message).toBe('Nothing to pay for Rent this time.')
    expect(options.action.label).toBe('Undo')

    await act(async () => options.action.onClick())
    await waitFor(() => expect(unmarkBillAction).toHaveBeenCalledWith(TENANT_SLUG, { billId: RENT_BILL_ID, dueOn: '2026-10-05' }))
  })

  it('offers Pause, not Resume, on a bill whose pause has run out', async () => {
    await renderBoard({ bills: [bill({ status: 'paused', pausedUntil: '2026-10-20' })], payments: [] })

    expect(screen.queryByRole('region', { name: 'Paused' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: 'More for Rent' }), { key: 'Enter' })
    expect(await screen.findByRole('menuitem', { name: 'Pause bill' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Resume bill' })).not.toBeInTheDocument()
  })

  it('the pause dialog refuses a resume day on or before today, in plain words, and sends nothing', async () => {
    const { BillStatusDialog } = await import('@/components/admin/expenses/bills/bill-status-dialogs')
    render(<BillStatusDialog target={{ kind: 'pause', bill: RENT_BILL }} onClose={jest.fn()} tenantId="t" tenantSlug={TENANT_SLUG} today={TODAY} />)

    for (const day of [TODAY, '2026-10-01']) {
      fireEvent.change(screen.getByLabelText(/Resume on/), { target: { value: day } })
      fireEvent.click(screen.getByRole('button', { name: 'Pause bill' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Pick a day after today, or leave it blank to pause until you resume it.')
    }
    expect(pauseBillAction).not.toHaveBeenCalled()
  })

  it('invites the first bill with presets when there are none', async () => {
    await renderBoard({ bills: [], payments: [] })

    expect(
      screen.getByText('Rent, kuryente, sahod… set up the bills you pay every month and we’ll remind you before they’re due.'),
    ).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: 'Start with' })).getByRole('button', { name: 'Kuryente' }))

    expect(await screen.findByRole('heading', { name: 'New bill' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Kuryente')
  })
})
