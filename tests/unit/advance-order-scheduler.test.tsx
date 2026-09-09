/**
 * The checkout's "When would you like it?" picker: date cards, time slots
 * grouped by part of day, the running summary, and the locked date a
 * pre-order cart carries.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { AdvanceOrderScheduler } from '@/components/customer/checkout-templates/checkout-primitives'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const scheduleDates = [
  { value: '2026-06-15', label: 'Today', isToday: true },
  { value: '2026-06-16', label: 'Tomorrow', isToday: false },
  { value: '2026-06-18', label: 'Thu, Jun 18', isToday: false },
]
const timeSlots = [
  { value: '10:00', label: '10:00 AM', minutes: 600 },
  { value: '13:00', label: '1:00 PM', minutes: 780 },
  { value: '18:00', label: '6:00 PM', minutes: 1080 },
]

function fakeCheckout(overrides: Partial<UseCheckoutReturn> = {}): UseCheckoutReturn {
  return {
    advanceConfig: { enabled: true, allowAsap: true, leadTimeMinutes: 30, maxDaysAhead: 7, slotIntervalMinutes: 30 },
    scheduleMode: 'scheduled',
    setScheduleMode: jest.fn(),
    scheduleDate: '2026-06-16',
    scheduleTime: '13:00',
    setScheduleTime: jest.fn(),
    scheduleDates,
    timeSlots,
    scheduledForLabel: 'Tue, Jun 16 · 1:00 PM',
    selectedOrderTypeData: { type: 'pickup' },
    handleScheduleDateChange: jest.fn(),
    cartPresellDate: null,
    tenant: null,
    branding: { buttonPrimary: '#ff5500' },
    ...overrides,
  } as unknown as UseCheckoutReturn
}

describe('AdvanceOrderScheduler', () => {
  it('renders nothing when scheduling is off', () => {
    const { container } = render(<AdvanceOrderScheduler checkout={fakeCheckout({ advanceConfig: { enabled: false, allowAsap: true, leadTimeMinutes: 0, maxDaysAhead: 0, slotIntervalMinutes: 30 } })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows each date as a card and marks the chosen one', () => {
    render(<AdvanceOrderScheduler checkout={fakeCheckout()} />)
    expect(screen.getByRole('radio', { name: /today/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /tomorrow/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /thu.*jun 18/i })).toBeInTheDocument()
  })

  it('reports a new date through the checkout hook', () => {
    const checkout = fakeCheckout()
    render(<AdvanceOrderScheduler checkout={checkout} />)
    fireEvent.click(screen.getByRole('radio', { name: /thu.*jun 18/i }))
    expect(checkout.handleScheduleDateChange).toHaveBeenCalledWith('2026-06-18')
  })

  it('groups the times by part of day and reports a pick', () => {
    const checkout = fakeCheckout()
    render(<AdvanceOrderScheduler checkout={checkout} />)
    expect(screen.getByText('Morning')).toBeInTheDocument()
    expect(screen.getByText('Afternoon')).toBeInTheDocument()
    expect(screen.getByText('Evening')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '1:00 PM' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: '6:00 PM' }))
    expect(checkout.setScheduleTime).toHaveBeenCalledWith('18:00')
  })

  it('sums the choice up as a ready time', () => {
    render(<AdvanceOrderScheduler checkout={fakeCheckout()} />)
    expect(screen.getByText(/ready/i)).toBeInTheDocument()
    expect(screen.getByText('Tue, Jun 16 · 1:00 PM')).toBeInTheDocument()
  })

  it('locks the date for a pre-order cart and hides the ASAP choice', () => {
    render(<AdvanceOrderScheduler checkout={fakeCheckout({ cartPresellDate: '2026-06-16', scheduleDates: [scheduleDates[1]] })} />)
    expect(screen.getByText(/Jun 16, 2026/)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /as soon as possible/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /tomorrow/i })).not.toBeInTheDocument()
  })

  it('says when a day has no times left', () => {
    render(<AdvanceOrderScheduler checkout={fakeCheckout({ timeSlots: [], scheduledForLabel: null })} />)
    expect(screen.getByText(/no more times available/i)).toBeInTheDocument()
  })
})
