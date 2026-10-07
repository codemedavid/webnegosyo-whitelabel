/**
 * The funnel's order form is Brunson's step two: a "yes" on the sales page
 * becomes a checkout lead on the monthly term, then lands on the existing
 * confirmation page with payment instructions.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
const submitCheckoutForm = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const fetchActivePlatformPaymentMethods = jest.fn<() => Promise<unknown>>()

jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
jest.mock('@/lib/meta-pixel', () => ({
  createMetaEventId: () => 'evt-1',
  getMetaBrowserData: () => ({}),
  trackMetaEvent: jest.fn(),
}))
jest.mock('@/app/actions/checkout-leads', () => ({
  submitCheckoutForm: (...args: unknown[]) => submitCheckoutForm(...args),
  fetchActivePlatformPaymentMethods: () => fetchActivePlatformPaymentMethods(),
}))

async function renderForm() {
  // next/jest leaves static imports ahead of jest.mock, so load lazily.
  const { FunnelOrderForm } = await import('@/components/funnel/funnel-order-form')
  return render(<FunnelOrderForm />)
}

async function fillValidForm() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/your name/i), 'Juan dela Cruz')
  await user.type(screen.getByLabelText(/email/i), 'juan@example.com')
  await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
  await user.type(screen.getByLabelText(/business name/i), "Juan's Kitchen")
  return user
}

describe('FunnelOrderForm', () => {
  beforeEach(() => {
    push.mockReset()
    submitCheckoutForm.mockReset()
    fetchActivePlatformPaymentMethods.mockResolvedValue([
      { id: 'pm-gcash', name: 'GCash', type: 'qr_code' },
    ])
  })

  it('creates a lead on the monthly term and opens its confirmation page', async () => {
    submitCheckoutForm.mockResolvedValue({
      data: { reference_number: 'SM-123', amount: 999 },
      error: null,
    })
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: /claim my setup slot/i }))

    await waitFor(() => expect(submitCheckoutForm).toHaveBeenCalledTimes(1))
    expect(submitCheckoutForm.mock.calls[0][0]).toMatchObject({
      name: 'Juan dela Cruz',
      business_name: "Juan's Kitchen",
      phone: '09171234567',
      selected_payment_method_id: 'pm-gcash',
      payment_term: 'monthly_subscription',
    })
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/checkout/confirmation?confirm=SM-123')
    )
  })

  it('carries the store set-up link onto the confirmation page', async () => {
    submitCheckoutForm.mockResolvedValue({
      data: { reference_number: 'SM-123', amount: 999 },
      error: null,
      setupToken: 'tok_abc',
    })
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: /claim my setup slot/i }))

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/checkout/confirmation?confirm=SM-123&setup=tok_abc')
    )
  })

  it('does not submit while required fields are missing', async () => {
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /claim my setup slot/i }))

    expect(submitCheckoutForm).not.toHaveBeenCalled()
    expect(await screen.findByText(/full name mo/i)).toBeTruthy()
  })

  it('keeps the visitor on the page when the lead is refused', async () => {
    submitCheckoutForm.mockResolvedValue({ data: null, error: 'Invalid payment term' })
    await renderForm()
    await waitFor(() => expect(fetchActivePlatformPaymentMethods).toHaveBeenCalled())

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: /claim my setup slot/i }))

    await waitFor(() => expect(submitCheckoutForm).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
  })
})
