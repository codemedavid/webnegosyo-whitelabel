import { describe, it, expect, jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { OutletModeScreen } from '@/components/customer/outlet-mode-screen'
import { WelcomeBannersRail } from '@/components/customer/welcome-banners-rail'
import { OutletSplash } from '@/components/customer/outlet-splash'
import type { PickerOutlet } from '@/components/customer/outlet-picker-screen'
import type { RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { WelcomeBanner } from '@/lib/outlets/welcome-page'

/**
 * The multi-branch welcome page: branded starter screen with its own promo
 * banners and a per-tenant entry — order-type tiles (the shipped default) or
 * one big call-to-action straight to the branch list. Tested through what a
 * customer sees and presses; an unconfigured tenant must get exactly the
 * screen that shipped before any of this existed.
 */

const MODES = ['dine_in', 'pickup', 'delivery'] as const

function makePickerOutlet(overrides: Partial<PickerOutlet> & { id: string }): PickerOutlet {
  return {
    slug: overrides.id,
    name: overrides.id,
    address: null,
    image_url: null,
    operating_hours: null,
    timezone: 'Asia/Manila',
    latitude: null,
    longitude: null,
    delivery_radius_km: null,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: true,
    is_active: true,
    sort_order: 0,
    ...overrides,
  }
}

const rankAll = (outlets: readonly PickerOutlet[]): RankedOutlet<PickerOutlet>[] =>
  outlets.map((outlet) => ({ outlet, distanceKm: null, withinDeliveryRadius: true }))

describe('OutletModeScreen — unconfigured tenant keeps the shipped screen', () => {
  it('renders the order-type tiles and reports the pressed mode', () => {
    const onSelect = jest.fn()
    render(
      <OutletModeScreen tenantName="Gungjeon" modes={MODES} onSelect={onSelect} welcome={null} />
    )
    fireEvent.click(screen.getByRole('button', { name: /pick.?up/i }))
    expect(onSelect).toHaveBeenCalledWith('pickup')
    expect(screen.getByText('Welcome to Gungjeon')).toBeInTheDocument()
  })

  it('shows no start-ordering button and no banner imagery', () => {
    render(<OutletModeScreen tenantName="Gungjeon" modes={MODES} onSelect={jest.fn()} welcome={{}} />)
    expect(screen.queryByRole('button', { name: /start ordering/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('OutletModeScreen — branded welcome page', () => {
  it('renders the custom heading and subheading', () => {
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{
          welcome_heading_text: 'Kamusta, kain tayo!',
          welcome_subheading_text: 'Korean BBQ, three branches',
        }}
      />
    )
    expect(screen.getByText('Kamusta, kain tayo!')).toBeInTheDocument()
    expect(screen.getByText('Korean BBQ, three branches')).toBeInTheDocument()
  })

  it('renders welcome banners from the tenant column', () => {
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{
          welcome_page_banners: [
            { id: 'a', imageUrl: 'https://ik.example/a.jpg', format: 'landscape', title: 'Buy 1 Take 1' },
          ],
        }}
      />
    )
    expect(screen.getByRole('img', { name: 'Buy 1 Take 1' })).toBeInTheDocument()
  })

  it('applies explicit theme colours to the page background', () => {
    const { container } = render(
      <OutletModeScreen
        tenantName="Gungjeon"
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{ welcome_background_color: '#101014' }}
      />
    )
    expect(container.firstElementChild).toHaveStyle({ backgroundColor: '#101014' })
  })
})

describe('OutletModeScreen — single CTA entry', () => {
  it('replaces the tiles with one big button carrying the custom text', () => {
    const onStartOrdering = jest.fn()
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        modes={MODES}
        onSelect={jest.fn()}
        onStartOrdering={onStartOrdering}
        welcome={{ welcome_entry_mode: 'single_cta', welcome_cta_text: 'Order Na!' }}
      />
    )
    expect(screen.queryByRole('button', { name: /pick.?up/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Order Na!' }))
    expect(onStartOrdering).toHaveBeenCalledTimes(1)
  })

  it('falls back to "Start Ordering" when no custom text is set', () => {
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        modes={MODES}
        onSelect={jest.fn()}
        onStartOrdering={jest.fn()}
        welcome={{ welcome_entry_mode: 'single_cta' }}
      />
    )
    expect(screen.getByRole('button', { name: 'Start Ordering' })).toBeInTheDocument()
  })

  it('also shows the CTA when the merchant merely toggled the tiles off', () => {
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        modes={MODES}
        onSelect={jest.fn()}
        onStartOrdering={jest.fn()}
        welcome={{ welcome_show_order_types: false }}
      />
    )
    expect(screen.getByRole('button', { name: 'Start Ordering' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delivery/i })).not.toBeInTheDocument()
  })
})

describe('WelcomeBannersRail', () => {
  const banner = (id: string, format: WelcomeBanner['format']): WelcomeBanner => ({
    id,
    imageUrl: `https://ik.example/${id}.jpg`,
    format,
    title: id,
  })

  it('renders nothing at all for an empty list', () => {
    const { container } = render(<WelcomeBannersRail banners={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders landscape banners full-width and portrait/square in a scroll rail', () => {
    render(
      <WelcomeBannersRail
        banners={[banner('wide', 'landscape'), banner('tall', 'portrait'), banner('box', 'square')]}
      />
    )
    expect(screen.getByRole('img', { name: 'wide' })).toBeInTheDocument()
    const rail = screen.getByTestId('welcome-banners-rail')
    expect(rail).toContainElement(screen.getByRole('img', { name: 'tall' }))
    expect(rail).toContainElement(screen.getByRole('img', { name: 'box' }))
    expect(rail).not.toContainElement(screen.getByRole('img', { name: 'wide' }))
  })
})

describe('OutletSplash — single CTA journey', () => {
  it('goes straight to the branch list on CTA press and reports a mode-less selection', () => {
    const outlets = [makePickerOutlet({ id: 'valenzuela' }), makePickerOutlet({ id: 'cainta' })]
    const onSelect = jest.fn()
    render(
      <OutletSplash
        tenantName="Gungjeon"
        outlets={outlets}
        reason={null}
        isLocating={false}
        onLocate={jest.fn()}
        rankFor={() => ({ outlets: rankAll(outlets) })}
        onSelect={onSelect}
        welcome={{ welcome_entry_mode: 'single_cta' }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start Ordering' }))
    expect(screen.getByText('Select Your Outlet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /valenzuela/i }))
    expect(onSelect).toHaveBeenCalledWith('valenzuela', null)
  })

  it('keeps the two-step tiles journey for an unconfigured tenant', () => {
    const outlets = [makePickerOutlet({ id: 'valenzuela' }), makePickerOutlet({ id: 'cainta' })]
    const onSelect = jest.fn()
    render(
      <OutletSplash
        tenantName="Gungjeon"
        outlets={outlets}
        reason={null}
        isLocating={false}
        onLocate={jest.fn()}
        rankFor={() => ({ outlets: rankAll(outlets) })}
        onSelect={onSelect}
        welcome={null}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /pick.?up/i }))
    fireEvent.click(screen.getByRole('button', { name: /cainta/i }))
    expect(onSelect).toHaveBeenCalledWith('cainta', 'pickup')
  })
})

/**
 * Two fixes after seeing the page on a live multi-branch tenant:
 * the flash-screen headline ("Loading menu...") was leaking into the welcome
 * heading, and three tiles wrapped 2 + 1 hard against the left edge.
 */
describe('OutletModeScreen — heading source', () => {
  it('never uses the flash-screen headline as the welcome heading', () => {
    render(
      <OutletModeScreen
        tenantName="Above Sea Level"
        promoHeadline="Loading menu..."
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{}}
      />
    )
    expect(screen.queryByText('Loading menu...')).not.toBeInTheDocument()
    expect(screen.getByText('Welcome to Above Sea Level')).toBeInTheDocument()
  })

  it('still prefers the merchant welcome heading over the tenant name', () => {
    render(
      <OutletModeScreen
        tenantName="Above Sea Level"
        promoHeadline="Loading menu..."
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{ welcome_heading_text: 'Kain na!' }}
      />
    )
    expect(screen.getByText('Kain na!')).toBeInTheDocument()
  })
})

describe('OutletModeScreen — tile layout', () => {
  it('lays the tiles out in a centred wrapping row so a lone third tile is not left-aligned', () => {
    render(<OutletModeScreen tenantName="Gungjeon" modes={MODES} onSelect={jest.fn()} welcome={null} />)
    const tiles = screen.getByTestId('welcome-mode-tiles')
    expect(tiles.className).toContain('flex-wrap')
    expect(tiles.className).toContain('justify-center')
    expect(tiles.children).toHaveLength(3)
  })
})
