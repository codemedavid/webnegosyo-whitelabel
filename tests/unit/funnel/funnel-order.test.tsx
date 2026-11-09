/**
 * The plans + order section: six months starts chosen, the buyer can switch
 * to a ₱2,000 downpayment or to the monthly plan, and the form files exactly
 * the term on screen while the summary shows what is due today.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
const submitCheckoutForm = jest.fn<(...args: unknown[]) => Promise<unknown>>()

jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
jest.mock('@/lib/meta-pixel', () => ({
  createMetaEventId: () => 'evt-1',
  getMetaBrowserData: () => ({}),
  trackMetaEvent: jest.fn(),
}))
jest.mock('@/app/actions/checkout-leads', () => ({
  submitCheckoutForm: (...args: unknown[]) => submitCheckoutForm(...args),
  fetchActivePlatformPaymentMethods: () => Promise.resolve([{ id: 'pm-gcash', name: 'GCash', type: 'qr_code' }]),
}))

async function renderOrder() {
  // next/jest leaves static imports ahead of jest.mock, so load lazily.
  const { FunnelOrder } = await import('@/components/funnel/funnel-order')
  render(<FunnelOrder />)
  await screen.findByLabelText('GCash')
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, button: RegExp) {
  await user.type(screen.getByLabelText(/your name/i), 'Juan dela Cruz')
  await user.type(screen.getByLabelText(/email/i), 'juan@example.com')
  await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
  await user.type(screen.getByLabelText(/business name/i), "Juan's Kitchen")
  await user.click(screen.getByRole('button', { name: button }))
  await waitFor(() => expect(submitCheckoutForm).toHaveBeenCalledTimes(1))
  return (submitCheckoutForm.mock.calls[0][0] as { payment_term: string }).payment_term
}

function dueToday(): string {
  return screen.getByTestId('funnel-due-today').textContent ?? ''
}

describe('FunnelOrder', () => {
  beforeEach(() => {
    push.mockReset()
    submitCheckoutForm.mockReset()
    submitCheckoutForm.mockResolvedValue({ data: { reference_number: 'SM-1', amount: 1 }, error: null })
  })

  it('starts on six months paid in full', async () => {
    await renderOrder()
    expect((screen.getByRole('radio', { name: /6 months/i }) as HTMLInputElement).checked).toBe(true)
    expect(dueToday()).toBe('₱5,499')

    const term = await fillAndSubmit(userEvent.setup(), /kunin ang 6-month plan/i)
    expect(term).toBe('six_month_full')
  })

  it('files the downpayment term and charges ₱2,000 today', async () => {
    await renderOrder()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: /downpayment muna/i }))
    expect(dueToday()).toBe('₱2,000')
    expect(screen.getByText('₱3,499', { selector: 'dd' })).toBeTruthy()

    expect(await fillAndSubmit(user, /kunin ang 6-month plan/i)).toBe('six_month_downpayment')
  })

  it('files the monthly term when the buyer picks monthly', async () => {
    await renderOrder()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: /monthly/i }))
    expect(dueToday()).toBe('₱1,499')
    expect(screen.queryByRole('radio', { name: /downpayment muna/i })).toBeNull()

    expect(await fillAndSubmit(user, /start monthly/i)).toBe('monthly_subscription')
  })
})
