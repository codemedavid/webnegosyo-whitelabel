import { render, screen } from '@testing-library/react'
import { AddToWalletButtons, WalletHint } from '@/components/customer/add-to-wallet-buttons'

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

  test('shows each wallet as its badge artwork, not a generic icon', () => {
    render(<AddToWalletButtons {...props} wallets={{ apple: true, google: true }} />)
    expect(screen.getByRole('img', { name: 'Add to Apple Wallet' })).toHaveAttribute('src', '/wallet/add-to-apple-wallet.svg')
    expect(screen.getByRole('img', { name: 'Add to Google Wallet' })).toHaveAttribute('src', '/wallet/add-to-google-wallet.svg')
  })

  test('tells the customer what saving the card does', () => {
    render(<AddToWalletButtons {...props} wallets={{ apple: true, google: false }} />)
    expect(screen.getByRole('heading', { name: /save your card to your phone/i })).toBeInTheDocument()
  })

  test('offers only the wallets that are configured', () => {
    render(<AddToWalletButtons {...props} wallets={{ apple: false, google: true }} />)
    expect(screen.queryByRole('link', { name: /apple wallet/i })).toBeNull()
    expect(screen.getByRole('link', { name: /google wallet/i })).toBeInTheDocument()
  })
})

describe('WalletHint', () => {
  test('renders nothing when no wallet is configured', () => {
    expect(render(<WalletHint wallets={null} />).container).toBeEmptyDOMElement()
    expect(render(<WalletHint wallets={{ apple: false, google: false }} />).container).toBeEmptyDOMElement()
  })

  test('names the available wallets with their logos and offers no link before there is a card', () => {
    render(<WalletHint wallets={{ apple: true, google: true }} />)
    const hint = screen.getByTestId('wallet-hint')
    expect(hint).toHaveTextContent(/apple wallet/i)
    expect(hint).toHaveTextContent(/google wallet/i)
    expect(screen.getByRole('img', { name: 'Apple Wallet' })).toHaveAttribute('src', '/wallet/apple-wallet-icon.svg')
    expect(screen.getByRole('img', { name: 'Google Wallet' })).toHaveAttribute('src', '/wallet/google-wallet-icon.svg')
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('names only the configured wallet', () => {
    render(<WalletHint wallets={{ apple: false, google: true }} />)
    expect(screen.getByTestId('wallet-hint')).not.toHaveTextContent(/apple/i)
    expect(screen.getByRole('img', { name: 'Google Wallet' })).toBeInTheDocument()
  })
})
