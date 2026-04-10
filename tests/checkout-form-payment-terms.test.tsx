import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutForm } from '@/components/landing/checkout-form'
import { getCheckoutPayableAmount } from '@/lib/checkout-leads/payment-terms'

const push = jest.fn()
const submitCheckoutForm = jest.fn()
const fetchActivePlatformPaymentMethods = jest.fn()
const trackMetaEvent = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}))

jest.mock('@/app/actions/checkout-leads', () => ({
  submitCheckoutForm: (...args: unknown[]) => submitCheckoutForm(...args),
  fetchActivePlatformPaymentMethods: (...args: unknown[]) => fetchActivePlatformPaymentMethods(...args),
}))

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}))

jest.mock('@/lib/meta-pixel', () => ({
  createMetaEventId: jest.fn(() => 'meta-event-id'),
  getMetaBrowserData: jest.fn(() => ({ fbp: 'fbp', fbc: 'fbc' })),
  trackMetaEvent: (...args: unknown[]) => trackMetaEvent(...args),
}))

describe('CheckoutForm payment terms', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchActivePlatformPaymentMethods.mockResolvedValue([
      {
        id: 'payment-method-1',
        name: 'GCash',
        type: 'qr_code',
        details: 'Scan to pay',
      },
    ])
    submitCheckoutForm.mockResolvedValue({
      data: {
        reference_number: 'WN-20260410-ABCD',
        amount: null,
      },
    })
  })

  it('defaults to downpayment_50, waits for the payment UI, and uses computed analytics fallback for uncontrolled submits', async () => {
    const user = userEvent.setup()
    render(<CheckoutForm />)

    const paymentMethodButton = await screen.findByRole('button', { name: /gcash/i })

    expect(screen.getByRole('radio', { name: /50% Downpayment/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Full Payment/i })).not.toBeChecked()

    await user.type(screen.getByLabelText('Full Name'), 'Juan Dela Cruz')
    await user.type(screen.getByLabelText('Email Address'), 'juan@example.com')
    await user.type(screen.getByLabelText('Phone Number'), '09171234567')
    await user.type(screen.getByLabelText('Business Name'), 'Juan Kitchen')
    await user.click(paymentMethodButton)
    await user.click(screen.getByRole('button', { name: /complete purchase/i }))

    await waitFor(() => {
      expect(submitCheckoutForm).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_term: 'downpayment_50',
        })
      )
    })

    await waitFor(() => {
      expect(trackMetaEvent).toHaveBeenCalledWith(
        'Lead',
        expect.objectContaining({
          value: getCheckoutPayableAmount('downpayment_50'),
        }),
        'meta-event-id'
      )
    })
  })

  it('submits full_payment from a fresh uncontrolled render and uses the matching analytics fallback', async () => {
    const user = userEvent.setup()
    render(<CheckoutForm />)

    const paymentMethodButton = await screen.findByRole('button', { name: /gcash/i })
    await user.click(screen.getByRole('radio', { name: /Full Payment/i }))
    expect(screen.getByRole('radio', { name: /Full Payment/i })).toBeChecked()

    await user.type(screen.getByLabelText('Full Name'), 'Juan Dela Cruz')
    await user.type(screen.getByLabelText('Email Address'), 'juan@example.com')
    await user.type(screen.getByLabelText('Phone Number'), '09171234567')
    await user.type(screen.getByLabelText('Business Name'), 'Juan Kitchen')
    await user.click(paymentMethodButton)
    await user.click(screen.getByRole('button', { name: /complete purchase/i }))

    await waitFor(() => {
      expect(submitCheckoutForm).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_term: 'full_payment',
        })
      )
    })

    await waitFor(() => {
      expect(trackMetaEvent).toHaveBeenCalledWith(
        'Lead',
        expect.objectContaining({
          value: getCheckoutPayableAmount('full_payment'),
        }),
        'meta-event-id'
      )
    })
  })

  it('prevents duplicate submits and shows a loading state while the request is pending', async () => {
    const user = userEvent.setup()
    let resolveSubmit: ((value: { data: { reference_number: string; amount: number | null } }) => void) | undefined
    submitCheckoutForm.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve
        })
    )

    render(<CheckoutForm />)

    const paymentMethodButton = await screen.findByRole('button', { name: /gcash/i })

    await user.type(screen.getByLabelText('Full Name'), 'Juan Dela Cruz')
    await user.type(screen.getByLabelText('Email Address'), 'juan@example.com')
    await user.type(screen.getByLabelText('Phone Number'), '09171234567')
    await user.type(screen.getByLabelText('Business Name'), 'Juan Kitchen')
    await user.click(paymentMethodButton)

    const form = screen.getByRole('button', { name: /complete purchase/i }).closest('form')
    expect(form).not.toBeNull()

    fireEvent.submit(form as HTMLFormElement)
    fireEvent.submit(form as HTMLFormElement)

    await waitFor(() => {
      expect(submitCheckoutForm).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled()

    resolveSubmit?.({
      data: {
        reference_number: 'WN-20260410-PENDING',
        amount: getCheckoutPayableAmount('downpayment_50'),
      },
    })

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/checkout/confirmation/WN-20260410-PENDING')
    })
  })
})
