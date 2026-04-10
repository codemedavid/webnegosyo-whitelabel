import React from 'react'
import { render, screen } from '@testing-library/react'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

jest.mock('@/components/landing/checkout-form', () => ({
  CheckoutForm: () => <div data-testid="checkout-form">checkout form</div>,
}))

jest.mock('@/components/tracking/meta-pixel-bootstrap', () => ({
  MetaPixelBootstrap: () => null,
}))

import CheckoutPage from '@/app/checkout/page'

describe('Marketing checkout page', () => {
  it('renders the Loom tutorial above the form card with autoplay muted enabled', async () => {
    const page = await CheckoutPage()
    const { container } = render(page)

    const tutorial = container.querySelector('iframe[title="Checkout Tutorial Video"]')
    expect(tutorial).toBeInTheDocument()
    expect(tutorial).toHaveAttribute(
      'src',
      expect.stringContaining('https://www.loom.com/embed/02d3b1e132f4459fa1effcb06e2b8491')
    )
    expect(tutorial).toHaveAttribute('src', expect.stringContaining('autoplay=1'))
    expect(tutorial).toHaveAttribute('src', expect.stringContaining('muted=1'))

    const tutorialSection = tutorial?.closest('[data-testid="checkout-tutorial"]')
    const formCard = screen.getByTestId('checkout-form').closest('.rounded-2xl')

    expect(tutorialSection).toBeInTheDocument()
    expect(formCard).toBeInTheDocument()
    expect(
      tutorialSection?.compareDocumentPosition(formCard as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})
