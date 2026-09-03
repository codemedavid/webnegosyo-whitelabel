/**
 * The customer-facing calendar: every allocated date shows what is left, a
 * sold-out or unallocated date cannot be chosen, and the choice is reported as
 * a plain YYYY-MM-DD.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { PresellDatePicker } from '@/components/customer/presell-date-picker'

const calendar = new Map([
  ['2026-12-20', 10],
  ['2026-12-24', 3],
  ['2026-12-25', 0],
])

const baseProps = {
  calendar,
  todayKey: '2026-12-18',
  selectedDate: null as string | null,
  onSelect: jest.fn(),
  accentColor: '#ff5500',
}

beforeEach(() => jest.clearAllMocks())

describe('PresellDatePicker', () => {
  it('opens on the month of the first available date', () => {
    render(<PresellDatePicker {...baseProps} />)
    expect(screen.getByText('December 2026')).toBeInTheDocument()
  })

  it('shows the remaining count on each allocated date', () => {
    render(<PresellDatePicker {...baseProps} />)
    expect(screen.getByRole('button', { name: /Dec 24.*3 left/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dec 20.*10 left/ })).toBeInTheDocument()
  })

  it('disables a sold-out date and an unallocated date', () => {
    render(<PresellDatePicker {...baseProps} />)
    expect(screen.getByRole('button', { name: /Dec 25.*sold out/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Dec 22/ })).toBeDisabled()
  })

  it('disables an allocated date that is already in the past', () => {
    render(<PresellDatePicker {...baseProps} todayKey="2026-12-23" />)
    expect(screen.getByRole('button', { name: /^Dec 20/ })).toBeDisabled()
  })

  it('reports the chosen date as YYYY-MM-DD', () => {
    render(<PresellDatePicker {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Dec 24/ }))
    expect(baseProps.onSelect).toHaveBeenCalledWith('2026-12-24')
  })

  it('marks the selected date as pressed', () => {
    render(<PresellDatePicker {...baseProps} selectedDate="2026-12-24" />)
    expect(screen.getByRole('button', { name: /Dec 24/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('moves between months', () => {
    render(<PresellDatePicker {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText('January 2027')).toBeInTheDocument()
  })

  it('says so when nothing is on sale', () => {
    render(<PresellDatePicker {...baseProps} calendar={new Map()} />)
    expect(screen.getByText(/no dates available/i)).toBeInTheDocument()
  })
})
