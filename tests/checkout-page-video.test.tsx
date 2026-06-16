import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getCheckoutPayableAmount } from '@/lib/checkout-leads/payment-terms'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const push = jest.fn()
const submitCheckoutForm = jest.fn()
const fetchActivePlatformPaymentMethods = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}))

jest.mock('@/app/actions/checkout-leads', () => ({
  submitCheckoutForm: (...args: unknown[]) => submitCheckoutForm(...args),
  fetchActivePlatformPaymentMethods: (...args: unknown[]) => fetchActivePlatformPaymentMethods(...args),
}))

jest.mock('@/components/tracking/meta-pixel-bootstrap', () => ({
  MetaPixelBootstrap: () => null,
}))

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}))

jest.mock('@/lib/meta-pixel', () => ({
  createMetaEventId: jest.fn(() => 'meta-event-id'),
  getMetaBrowserData: jest.fn(() => ({ fbp: 'fbp', fbc: 'fbc' })),
  trackMetaEvent: jest.fn(),
}))

import CheckoutPage, { metadata } from '@/app/checkout/page'
import { CheckoutPageClient } from '@/app/checkout/checkout-page-client'

describe('Marketing checkout page', () => {
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
        amount: getCheckoutPayableAmount('full_payment'),
      },
    })
  })

  it('exports the original checkout metadata on the route', async () => {
    expect(metadata).toEqual({
      title: 'Checkout - WebNegosyo Smart Menu System',
      description: 'Complete your purchase of the Smart Menu System. One-time ₱3,899.',
    })
    expect(typeof CheckoutPage).toBe('function')
  })

  it('updates the summary and submit payload when the real payment-term radio changes', async () => {
    const user = userEvent.setup()
    const { container } = render(<CheckoutPageClient />)
    const paymentMethodButton = await screen.findByRole('button', { name: /gcash/i })

    const tutorial = container.querySelector('iframe[title="Checkout Tutorial Video"]')
    expect(tutorial).toBeInTheDocument()
    expect(tutorial).toHaveAttribute(
      'src',
      expect.stringContaining('https://www.loom.com/embed/70da55654c904a60b18ef9ee8dae4ea0')
    )
    expect(tutorial).toHaveAttribute('src', expect.stringContaining('autoplay=1'))
    expect(tutorial).toHaveAttribute('src', expect.stringContaining('muted=1'))

    const tutorialSection = tutorial?.closest('[data-testid="checkout-tutorial"]')
    const formCard = screen.getByText('Your Details').closest('.rounded-2xl')

    expect(tutorialSection).toBeInTheDocument()
    expect(formCard).toBeInTheDocument()
    expect(
      (tutorialSection as Element).compareDocumentPosition(formCard as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    expect(screen.getByText('Pay Today')).toBeInTheDocument()
    expect(screen.getByText('Full Price')).toBeInTheDocument()
    expect(screen.getAllByText(/3,899/).length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByText(new RegExp(getCheckoutPayableAmount('downpayment_50').toLocaleString()))
        .length
    ).toBeGreaterThanOrEqual(1)

    await user.click(screen.getByRole('radio', { name: /full payment/i }))

    expect(
      screen.getAllByText(new RegExp(getCheckoutPayableAmount('full_payment').toLocaleString()))
        .length
    ).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/3,899/).length).toBeGreaterThanOrEqual(2)

    await user.type(screen.getByLabelText('Full Name'), 'Juan Dela Cruz')
    await user.type(screen.getByLabelText('Email Address'), 'juan@example.com')
    await user.type(screen.getByLabelText('Phone Number'), '09171234567')
    await user.type(screen.getByLabelText('Business Name'), 'Juan Kitchen')
    await user.click(paymentMethodButton)
    await user.click(screen.getByRole('button', { name: /complete purchase/i }))

    expect(submitCheckoutForm).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_term: 'full_payment',
      })
    )
  })
})
