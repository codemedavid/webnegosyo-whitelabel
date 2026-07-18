import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CheckoutLoading } from '@/components/customer/checkout-templates/checkout-shared'
import { TenantFlashProvider } from '@/components/customer/flash-screen-loader'
import type { FlashScreenBranding } from '@/lib/flash-loader'

const branding: FlashScreenBranding = {
  title: 'Welcome to Mcbels',
  subtitle: null,
  imageUrl: null,
  initial: 'M',
  backgroundColor: '#fbf7d8',
  textColor: '#111111',
}

describe('CheckoutLoading', () => {
  it('renders the branded flash splash when the tenant has flash enabled', () => {
    render(
      <TenantFlashProvider branding={branding}>
        <CheckoutLoading />
      </TenantFlashProvider>,
    )
    // Branded flash title shows, not the generic checkout spinner text.
    expect(screen.getByText('Welcome to Mcbels')).toBeInTheDocument()
    expect(screen.queryByText('Loading checkout...')).not.toBeInTheDocument()
  })

  it('falls back to the checkout spinner when flash is disabled or absent', () => {
    render(<CheckoutLoading />)
    expect(screen.getByText('Loading checkout...')).toBeInTheDocument()
  })

  it('stays propless so it is usable as a next/dynamic loading fallback', () => {
    // dynamic()'s `loading` passes no props; calling with none must not throw.
    expect(() => render(<CheckoutLoading />)).not.toThrow()
  })
})
