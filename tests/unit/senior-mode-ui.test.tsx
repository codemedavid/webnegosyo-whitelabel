/**
 * Senior-friendly mode — the storefront pieces it adds.
 *
 * Each piece must (a) render NOTHING when the merchant has the mode off, so
 * existing stores are untouched, and (b) when on, name things in words:
 * "View cart", "Back to menu", "Step 2 of 4" — an older customer should never
 * have to guess what an icon means.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ReactNode } from 'react'
import { getTenantBranding } from '@/lib/branding-utils'

const mockPush = jest.fn()
let mockPathname = '/acme/menu'
let mockCart = { item_count: 0, total: 0 }

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, prefetch: jest.fn(), back: jest.fn() }),
  usePathname: () => mockPathname,
}))

jest.mock('@/hooks/useCart', () => ({
  useCart: () => mockCart,
}))

const branding = getTenantBranding(null)

async function load() {
  const provider = await import('@/components/customer/senior-mode/senior-mode-provider')
  const bar = await import('@/components/customer/senior-mode/senior-cart-bar')
  const steps = await import('@/components/customer/senior-mode/senior-order-steps')
  const header = await import('@/components/customer/header-templates/header-parts')
  return { ...provider, ...bar, ...steps, ...header }
}

async function renderWithMode(isOn: boolean, ui: (m: Awaited<ReturnType<typeof load>>) => ReactNode) {
  const m = await load()
  return render(<m.SeniorModeProvider isSavedOn={isOn}>{ui(m)}</m.SeniorModeProvider>)
}

beforeEach(() => {
  mockPush.mockClear()
  mockPathname = '/acme/menu'
  mockCart = { item_count: 0, total: 0 }
})

describe('SeniorModeProvider', () => {
  it('enlarges the page only while the mode is on', async () => {
    const { container, rerender } = await renderWithMode(true, () => <p>menu</p>)
    expect(container.querySelector('style')?.textContent).toContain('font-size:112.5%')

    const m = await load()
    rerender(<m.SeniorModeProvider isSavedOn={false}><p>menu</p></m.SeniorModeProvider>)
    expect(container.querySelector('style')).toBeNull()
  })

  it('hides the designs\' own cart/checkout headers so only one back button shows', async () => {
    const { container } = await renderWithMode(true, () => <p>cart</p>)
    expect(container.querySelector('style')?.textContent).toContain('[data-senior-hidden]{display:none!important}')
  })

  it('stays off on the merchant admin even when the store has it on', async () => {
    mockPathname = '/acme/admin/orders'
    const { container } = await renderWithMode(true, (m) => <m.SeniorCartBar tenantSlug="acme" branding={branding} />)
    expect(container.querySelector('style')).toBeNull()
    expect(screen.queryByText(/your cart/i)).toBeNull()
  })
})

describe('SeniorCartBar', () => {
  it('renders nothing when the mode is off', async () => {
    mockCart = { item_count: 2, total: 300 }
    await renderWithMode(false, (m) => <m.SeniorCartBar tenantSlug="acme" branding={branding} />)
    expect(screen.queryByRole('button', { name: /view cart/i })).toBeNull()
  })

  it('tells an empty cart how to start, instead of hiding', async () => {
    await renderWithMode(true, (m) => <m.SeniorCartBar tenantSlug="acme" branding={branding} />)
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByText(/tap any food to add it/i)).toBeInTheDocument()
  })

  it('shows the count and total, and opens the cart page in one tap', async () => {
    mockCart = { item_count: 3, total: 450 }
    await renderWithMode(true, (m) => <m.SeniorCartBar tenantSlug="acme" branding={branding} />)

    const button = screen.getByRole('button', { name: /view cart/i })
    expect(button).toHaveTextContent('3 items')
    expect(button).toHaveTextContent('450.00')

    await userEvent.click(button)
    expect(mockPush).toHaveBeenCalledWith('/acme/cart')
  })
})

describe('SeniorCartBar "Added!" cue', () => {
  afterEach(() => jest.useRealTimers())

  it('does not claim "Added!" for a cart restored on page load, only for a real add', async () => {
    jest.useFakeTimers()
    const m = await load()
    const bar = (count: number) => {
      mockCart = { item_count: count, total: count * 100 }
      return <m.SeniorModeProvider isSavedOn><m.SeniorCartBar tenantSlug="acme" branding={branding} /></m.SeniorModeProvider>
    }

    // Hard load: CartProvider restores localStorage just after mount (0 → 2).
    const { rerender } = render(bar(0))
    rerender(bar(2))
    expect(screen.queryByText(/added!/i)).toBeNull()

    // Later, the customer adds a dish.
    act(() => { jest.advanceTimersByTime(1500) })
    rerender(bar(3))
    expect(screen.getByText(/added!/i)).toBeInTheDocument()

    act(() => { jest.advanceTimersByTime(3000) })
    expect(screen.queryByText(/added!/i)).toBeNull()
  })
})

describe('SeniorOrderSteps', () => {
  it('renders nothing when the mode is off', async () => {
    await renderWithMode(false, (m) => <m.SeniorOrderSteps current="cart" branding={branding} />)
    expect(screen.queryByText(/step 2 of 4/i)).toBeNull()
  })

  it('says which step the customer is on, in words', async () => {
    await renderWithMode(true, (m) => <m.SeniorOrderSteps current="cart" branding={branding} />)
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()
    const current = screen.getByRole('listitem', { current: 'step' })
    expect(current).toHaveTextContent('Check cart')
  })

  it('tells the customer what comes next', async () => {
    await renderWithMode(true, (m) => <m.SeniorOrderSteps current="cart" branding={branding} />)
    expect(screen.getByText(/^next:/i)).toHaveTextContent('Next: Your details')
  })

  it('offers a labelled back button that goes where it says', async () => {
    const onBack = jest.fn()
    await renderWithMode(true, (m) => (
      <m.SeniorOrderSteps current="checkout" branding={branding} backLabel="Back to cart" onBack={onBack} />
    ))
    await userEvent.click(screen.getByRole('button', { name: 'Back to cart' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('has no back button once the order is sent', async () => {
    await renderWithMode(true, (m) => <m.SeniorOrderSteps current="done" branding={branding} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/step 4 of 4/i)).toBeInTheDocument()
    expect(screen.queryByText(/^next:/i)).toBeNull()
  })
})

describe('cart and checkout designs hand their header over to the step tracker', () => {
  // Every design's header holds a small unlabelled back arrow. In senior mode
  // SeniorOrderSteps supplies the labelled one, so a design whose header is
  // not tagged would show two back buttons stacked on top of each other.
  const designFiles = [
    ['cart-templates', /-cart\.tsx$/],
    ['checkout-templates', /-checkout\.tsx$/],
  ].flatMap(([dir, pattern]) => {
    const base = join(process.cwd(), 'src/components/customer', dir as string)
    return readdirSync(base).filter((f) => (pattern as RegExp).test(f)).map((f) => join(base, f))
  })

  it('finds the designs', () => {
    expect(designFiles.length).toBeGreaterThanOrEqual(10)
  })

  it.each(designFiles)('%s tags every <header> with data-senior-hidden', (file) => {
    const headers = readFileSync(file, 'utf8').match(/<header\b[^>]*>/g) ?? []
    for (const header of headers) expect(header).toContain('data-senior-hidden')
  })
})

describe('HeaderCartButton', () => {
  it('keeps the compact icon when the mode is off', async () => {
    await renderWithMode(false, (m) => <m.HeaderCartButton itemCount={2} onClick={jest.fn()} branding={branding} />)
    expect(screen.getByRole('button', { name: 'Open cart' })).not.toHaveTextContent('Cart')
  })

  it('spells out "Cart" and the count when the mode is on', async () => {
    await renderWithMode(true, (m) => <m.HeaderCartButton itemCount={2} onClick={jest.fn()} branding={branding} />)
    const button = screen.getByRole('button', { name: /open cart, 2 items/i })
    expect(button).toHaveTextContent('Cart')
    expect(button).toHaveTextContent('2')
  })
})
