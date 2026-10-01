import { render, screen } from '@testing-library/react'
import { AddToWalletButtons } from '@/components/customer/add-to-wallet-buttons'

const props = { orderId: 'order-1', tenantId: 'tenant-1', trackingToken: 'tok en' }

describe('AddToWalletButtons', () => {
  test('renders nothing when no wallet is configured', () => {
    const { container } = render(<AddToWalletButtons {...props} wallets={null} />)
    expect(container).toBeEmptyDOMElement()
    const none = render(<AddToWalletButtons {...props} wallets={{ apple: false, google: false }} />)
    expect(none.container).toBeEmptyDOMElement()
  })

  test('links each available wallet to its route with the receipt proof', () => {
    render(<AddToWalletButtons {...props} wallets={{ apple: true, google: true }} />)
    expect(screen.getByRole('link', { name: /apple wallet/i })).toHaveAttribute(
      'href',
      '/api/loyalty/passes/apple?orderId=order-1&tenantId=tenant-1&token=tok+en',
    )
    expect(screen.getByRole('link', { name: /google wallet/i })).toHaveAttribute(
      'href',
      '/api/loyalty/passes/google?orderId=order-1&tenantId=tenant-1&token=tok+en',
    )
  })

  test('offers only the wallets that are configured', () => {
    render(<AddToWalletButtons {...props} wallets={{ apple: false, google: true }} />)
    expect(screen.queryByRole('link', { name: /apple wallet/i })).toBeNull()
    expect(screen.getByRole('link', { name: /google wallet/i })).toBeInTheDocument()
  })
})
