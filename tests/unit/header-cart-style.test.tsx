/**
 * Header cart button styles.
 *
 * The bare 🛒 emoji stays the default so existing stores look unchanged; the
 * other styles are opt-in from Branding Studio → Header → Cart button. Every
 * style must keep the same accessible name and show the item count.
 */
import { render, screen } from '@testing-library/react'
import { HeaderCartButton } from '@/components/customer/header-templates/header-parts'
import { getTenantBranding } from '@/lib/branding-utils'
import {
  DEFAULT_HEADER_CONFIG,
  HEADER_CART_STYLES,
  getHeaderConfig,
} from '@/lib/header-templates'

const branding = getTenantBranding(null)

describe('getHeaderConfig cartStyle', () => {
  it('defaults to the emoji so existing stores are untouched', () => {
    expect(getHeaderConfig(null).cartStyle).toBe('emoji')
    expect(DEFAULT_HEADER_CONFIG.cartStyle).toBe('emoji')
  })

  it.each(HEADER_CART_STYLES)('reads the stored "%s" style', (style) => {
    expect(getHeaderConfig({ header_cart_style: style }).cartStyle).toBe(style)
  })

  it('falls back to the emoji for an unknown stored value', () => {
    expect(getHeaderConfig({ header_cart_style: 'sparkles' }).cartStyle).toBe('emoji')
  })
})

describe('HeaderCartButton styles', () => {
  it('renders the emoji when no style is given', () => {
    render(<HeaderCartButton itemCount={0} onClick={jest.fn()} branding={branding} />)
    expect(screen.getByRole('button', { name: 'Open cart' })).toHaveTextContent('🛒')
  })

  it.each(HEADER_CART_STYLES.filter((s) => s !== 'emoji'))(
    '"%s" replaces the emoji with an icon',
    (style) => {
      render(<HeaderCartButton itemCount={0} onClick={jest.fn()} branding={branding} cartStyle={style} />)
      const button = screen.getByRole('button', { name: 'Open cart' })
      expect(button).not.toHaveTextContent('🛒')
      expect(button.querySelector('svg')).not.toBeNull()
    }
  )

  it.each(HEADER_CART_STYLES)('"%s" shows the item count', (style) => {
    render(<HeaderCartButton itemCount={3} onClick={jest.fn()} branding={branding} cartStyle={style} />)
    expect(screen.getByRole('button', { name: 'Open cart' })).toHaveTextContent('3')
  })

  it('"pill" spells out "Cart"', () => {
    render(<HeaderCartButton itemCount={0} onClick={jest.fn()} branding={branding} cartStyle="pill" />)
    expect(screen.getByRole('button', { name: 'Open cart' })).toHaveTextContent('Cart')
  })

  it('caps the count at 99+', () => {
    render(<HeaderCartButton itemCount={150} onClick={jest.fn()} branding={branding} cartStyle="icon" />)
    expect(screen.getByRole('button', { name: 'Open cart' })).toHaveTextContent('99+')
  })

  it.each(HEADER_CART_STYLES)('"%s" keeps the header-cart inspect scope', (style) => {
    const { container } = render(
      <HeaderCartButton itemCount={1} onClick={jest.fn()} branding={branding} cartStyle={style} />
    )
    expect(container.querySelector('[data-branding-scope="storefront/header-cart"]')).not.toBeNull()
  })
})

describe('HeaderCartButton count for screen readers', () => {
  it.each(HEADER_CART_STYLES)('the "%s" style describes its count, keeping the name "Open cart"', (style) => {
    render(<HeaderCartButton itemCount={3} onClick={() => undefined} branding={branding} cartStyle={style} />)

    expect(screen.getByRole('button', { name: 'Open cart' })).toHaveAccessibleDescription('3 items')
  })
})
