/**
 * The merchant's per-date allocation panel: a calendar to pick dates on, a
 * list of the dates already promised with a stepper each, the header totals,
 * and a range helper that fills several dates with one figure.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { PresellStockPanel } from '@/components/admin/presell-stock-panel'

const getPresellStockAction = jest.fn()
const savePresellAllocationAction = jest.fn()
const deletePresellAllocationAction = jest.fn()
jest.mock('@/app/actions/presell', () => ({
  getPresellStockAction: (...args: unknown[]) => getPresellStockAction(...args),
  savePresellAllocationAction: (...args: unknown[]) => savePresellAllocationAction(...args),
  deletePresellAllocationAction: (...args: unknown[]) => deletePresellAllocationAction(...args),
}))
const toast = { error: jest.fn(), success: jest.fn() }
jest.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toast.error(...a), success: (...a: unknown[]) => toast.success(...a) } }))

const row = (presell_date: string, stock_qty: number, sold_qty: number) => ({
  id: presell_date, tenant_id: 't1', menu_item_id: 'm1', presell_date, stock_qty, sold_qty, created_at: '',
})

const ROWS = [row('2026-12-20', 20, 3), row('2026-12-24', 8, 6), row('2026-12-25', 10, 10)]

function renderPanel() {
  return render(
    <PresellStockPanel tenantId="t1" tenantSlug="cafe" menuItemId="m1" todayKey="2026-12-18" />,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  getPresellStockAction.mockResolvedValue({ success: true, data: ROWS })
  savePresellAllocationAction.mockResolvedValue({ success: true })
  deletePresellAllocationAction.mockResolvedValue({ success: true })
})

describe('PresellStockPanel', () => {
  it('lists every upcoming date with what sold and what is left', async () => {
    renderPanel()
    const list = await screen.findByRole('list', { name: /upcoming dates/i })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Sun, Dec 20')
    expect(items[0]).toHaveTextContent('3 sold')
    expect(items[0]).toHaveTextContent('17 left')
    expect(items[2]).toHaveTextContent(/sold out/i)
  })

  it('totals the offer in the header', async () => {
    renderPanel()
    const summary = await screen.findByRole('group', { name: /pre-order summary/i })
    expect(summary).toHaveTextContent('3')
    expect(summary).toHaveTextContent('38')
    expect(summary).toHaveTextContent('19')
  })

  it('opens the month of the first upcoming date and marks allocated days', async () => {
    renderPanel()
    expect(await screen.findByText('December 2026')).toBeInTheDocument()
    const calendar = within(screen.getByRole('group', { name: /allocation calendar/i }))
    expect(calendar.getByRole('button', { name: /Dec 24.*2 left of 8/ })).toBeInTheDocument()
    expect(calendar.getByRole('button', { name: /Dec 25.*sold out/i })).toBeInTheDocument()
    expect(calendar.getByRole('button', { name: /^Dec 10/ })).toBeDisabled()
  })

  it('tapping an unallocated day asks how many to offer and saves it', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /^Dec 22/ }))
    const stock = screen.getByLabelText(/stock for Tue, Dec 22/i)
    fireEvent.change(stock, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /add date/i }))
    await waitFor(() =>
      expect(savePresellAllocationAction).toHaveBeenCalledWith('t1', 'cafe', {
        menuItemId: 'm1', presellDate: '2026-12-22', stockQty: 12,
      }),
    )
  })

  it('bumps stock from the list stepper', async () => {
    renderPanel()
    const list = await screen.findByRole('list', { name: /upcoming dates/i })
    const first = within(list).getAllByRole('listitem')[0]
    fireEvent.click(within(first).getByRole('button', { name: /increase stock/i }))
    await waitFor(() =>
      expect(savePresellAllocationAction).toHaveBeenCalledWith('t1', 'cafe', {
        menuItemId: 'm1', presellDate: '2026-12-20', stockQty: 21,
      }),
    )
  })

  it('will not lower stock below what already sold from the stepper', async () => {
    renderPanel()
    const list = await screen.findByRole('list', { name: /upcoming dates/i })
    const soldOut = within(list).getAllByRole('listitem')[2]
    expect(within(soldOut).getByRole('button', { name: /decrease stock/i })).toBeDisabled()
  })

  it('fills a date range with one figure, one save per day', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /several dates/i }))
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: '2026-12-21' } })
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-12-23' } })
    fireEvent.change(screen.getByLabelText(/stock per date/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /apply to 3 dates/i }))
    await waitFor(() => expect(savePresellAllocationAction).toHaveBeenCalledTimes(3))
    expect(savePresellAllocationAction).toHaveBeenCalledWith('t1', 'cafe', {
      menuItemId: 'm1', presellDate: '2026-12-23', stockQty: 5,
    })
  })

  it('surfaces the server refusal when a sold date cannot be removed', async () => {
    deletePresellAllocationAction.mockResolvedValue({ success: false, error: 'Date has sales' })
    renderPanel()
    const list = await screen.findByRole('list', { name: /upcoming dates/i })
    fireEvent.click(within(within(list).getAllByRole('listitem')[0]).getByRole('button', { name: /remove/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Date has sales'))
  })

  it('teaches the empty state instead of saying nothing', async () => {
    getPresellStockAction.mockResolvedValue({ success: true, data: [] })
    renderPanel()
    expect(await screen.findByText(/no dates offered yet/i)).toBeInTheDocument()
  })
})
