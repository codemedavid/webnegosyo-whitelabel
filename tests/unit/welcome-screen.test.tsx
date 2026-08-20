import { describe, it, expect, jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { OutletModeScreen } from '@/components/customer/outlet-mode-screen'
import { WelcomeBannerSlideshow } from '@/components/customer/welcome-banner-slideshow'
import { OutletSplash } from '@/components/customer/outlet-splash'
import type { PickerOutlet } from '@/components/customer/outlet-picker-screen'
import type { RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { WelcomeBanner } from '@/lib/outlets/welcome-page'
import type { Tenant } from '@/types/database'

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

describe('WelcomeBannerSlideshow', () => {
  const banner = (id: string, format: WelcomeBanner['format']): WelcomeBanner => ({
    id,
    imageUrl: `https://ik.example/${id}.jpg`,
    format,
    title: id,
  })

  it('renders nothing at all for an empty list', () => {
    const { container } = render(<WelcomeBannerSlideshow banners={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('puts every banner in one full-width deck regardless of format', () => {
    render(
      <WelcomeBannerSlideshow
        banners={[banner('wide', 'landscape'), banner('tall', 'portrait'), banner('box', 'square')]}
      />
    )
    const deck = screen.getByTestId('welcome-banner-slides')
    for (const name of ['wide', 'tall', 'box']) {
      expect(deck).toContainElement(screen.getByRole('img', { name }))
    }
    expect(deck.children).toHaveLength(3)
    expect((deck.children[0] as HTMLElement).className).toContain('w-full')
  })

  it('offers one dot per slide and marks the one being viewed', () => {
    render(
      <WelcomeBannerSlideshow banners={[banner('one', 'square'), banner('two', 'square')]} />
    )
    const dots = screen.getAllByRole('button', { name: /slide \d/i })
    expect(dots).toHaveLength(2)
    expect(dots[0]).toHaveAttribute('aria-current', 'true')

    fireEvent.click(dots[1])
    expect(dots[1]).toHaveAttribute('aria-current', 'true')
    expect(dots[0]).not.toHaveAttribute('aria-current', 'true')
  })

  it('shows no dots for a single banner — there is nothing to page through', () => {
    render(<WelcomeBannerSlideshow banners={[banner('solo', 'portrait')]} />)
    expect(screen.queryByRole('button', { name: /slide \d/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('welcome-banner-slides').children).toHaveLength(1)
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

describe('OutletModeScreen — centred header and logo', () => {
  it('keeps the left-aligned text-only header by default', () => {
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        logoUrl="https://cdn.test/logo.png"
        modes={MODES}
        onSelect={jest.fn()}
        welcome={null}
      />
    )
    expect(screen.getByTestId('welcome-header').className).not.toContain('text-center')
    expect(screen.queryByAltText('Gungjeon')).not.toBeInTheDocument()
  })

  it('centres the header when the merchant asks for it', () => {
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{ welcome_text_align: 'center' }}
      />
    )
    expect(screen.getByTestId('welcome-header').className).toContain('text-center')
  })

  it('shows the store logo in the header when switched on', () => {
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        logoUrl="https://cdn.test/logo.png"
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{ welcome_show_logo: true, welcome_text_align: 'center' }}
      />
    )
    expect(screen.getByAltText('Gungjeon')).toHaveAttribute('src', 'https://cdn.test/logo.png')
  })

  it('does not break when the logo is switched on but the tenant has none', () => {
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        logoUrl={null}
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{ welcome_show_logo: true }}
      />
    )
    expect(screen.queryByAltText('Gungjeon')).not.toBeInTheDocument()
    expect(screen.getByText('Welcome to Gungjeon')).toBeInTheDocument()
  })
})

/**
 * The welcome page can now lead with the STORE HEADER — the same branded bar
 * the menu page wears (logo, store name, tagline on the header colour) — but
 * centred and with no cart: there is nothing in the cart to open from a page
 * that comes before the menu.
 *
 * It is opt-in, and the heading/subheading copy is a separate switch.
 */
const STORE_TENANT = {
  name: 'Above Sea Level',
  logo_url: 'https://cdn.test/asl.png',
  header_tagline: 'Home of the Giant Butterfly Squid',
  header_color: '#1e4d8c',
} as unknown as Tenant

describe('OutletModeScreen — store header', () => {
  it('adds no store header to a tenant that never asked for one', () => {
    render(
      <OutletModeScreen
        tenantName="Above Sea Level"
        tenant={STORE_TENANT}
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{}}
      />
    )
    expect(screen.queryByTestId('welcome-store-header')).not.toBeInTheDocument()
  })

  it('renders the branded bar with the logo, store name and tagline when switched on', () => {
    render(
      <OutletModeScreen
        tenantName="Above Sea Level"
        tenant={STORE_TENANT}
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{ welcome_show_header: true }}
      />
    )
    const header = screen.getByTestId('welcome-store-header')
    expect(header).toHaveTextContent('Above Sea Level')
    expect(header).toHaveTextContent('Home of the Giant Butterfly Squid')
    expect(header.querySelector('img')).toBeInTheDocument()
  })

  it('never offers a cart from the welcome page', () => {
    render(
      <OutletModeScreen
        tenantName="Above Sea Level"
        tenant={STORE_TENANT}
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{ welcome_show_header: true }}
      />
    )
    expect(screen.queryByRole('button', { name: /cart/i })).not.toBeInTheDocument()
  })

  it('centres the bar whatever the merchant chose for the copy alignment', () => {
    render(
      <OutletModeScreen
        tenantName="Above Sea Level"
        tenant={STORE_TENANT}
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{ welcome_show_header: true, welcome_text_align: 'left' }}
      />
    )
    expect(screen.getByTestId('welcome-store-header').className).toContain('justify-center')
  })

  it('runs the bar and the copy as independent switches', () => {
    render(
      <OutletModeScreen
        tenantName="Above Sea Level"
        tenant={STORE_TENANT}
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{
          welcome_show_header: true,
          welcome_show_copy: false,
          welcome_heading_text: 'Kain na!',
        }}
      />
    )
    expect(screen.getByTestId('welcome-store-header')).toBeInTheDocument()
    expect(screen.queryByText('Kain na!')).not.toBeInTheDocument()
  })

  it('keeps the copy for a tenant that only switched the bar on', () => {
    render(
      <OutletModeScreen
        tenantName="Above Sea Level"
        tenant={STORE_TENANT}
        modes={MODES}
        onSelect={jest.fn()}
        welcome={{ welcome_show_header: true, welcome_heading_text: 'Kain na!' }}
      />
    )
    expect(screen.getByText('Kain na!')).toBeInTheDocument()
  })

  it('still tells the customer why they are being asked again with the copy off', () => {
    render(
      <OutletModeScreen
        tenantName="Gungjeon"
        modes={MODES}
        onSelect={jest.fn()}
        message="That branch is closed right now."
        welcome={{ welcome_show_copy: false }}
      />
    )
    expect(screen.getByText('That branch is closed right now.')).toBeInTheDocument()
  })
})

describe('OutletModeScreen — compact tiles', () => {
  it('keeps all three modes on a single row at every width', () => {
    render(<OutletModeScreen tenantName="Gungjeon" modes={MODES} onSelect={jest.fn()} welcome={null} />)
    const tile = screen.getByTestId('welcome-mode-tiles').children[0] as HTMLElement
    expect(tile.className).toContain('basis-[calc(33.333%')
    expect(tile.className).not.toContain('basis-[calc(50%')
  })
})

/**
 * The welcome page is the merchant's front door, so its palette has to paint
 * the whole screen. Two separate failures made the colour stop partway down:
 * the page panel only grew as tall as its content, and the fixed surface it
 * scrolls inside stayed the default background either side of the column.
 */
describe('Welcome page — the background fills the screen', () => {
  const BLUE = { welcome_background_color: '#1145d3' }

  it('grows the welcome panel to fill the scroll surface, not just its content', () => {
    render(<OutletModeScreen tenantName="Gungjeon" modes={MODES} onSelect={jest.fn()} welcome={BLUE} />)
    const page = screen.getByTestId('welcome-page')
    expect(page).toHaveStyle({ backgroundColor: '#1145d3' })
    expect(page.className).toContain('flex-1')
  })

  it('paints the full-screen surface behind the centred column', () => {
    render(
      <OutletSplash
        tenantName="Gungjeon"
        outlets={[makePickerOutlet({ id: 'a' }), makePickerOutlet({ id: 'b' })]}
        reason={null}
        isLocating={false}
        onLocate={jest.fn()}
        rankFor={() => ({ outlets: rankAll([makePickerOutlet({ id: 'a' })]) })}
        onSelect={jest.fn()}
        welcome={BLUE}
      />
    )
    expect(screen.getByTestId('welcome-surface')).toHaveStyle({ backgroundColor: '#1145d3' })
  })

  it('leaves an unconfigured tenant on the default surface background', () => {
    render(
      <OutletSplash
        tenantName="Gungjeon"
        outlets={[makePickerOutlet({ id: 'a' }), makePickerOutlet({ id: 'b' })]}
        reason={null}
        isLocating={false}
        onLocate={jest.fn()}
        rankFor={() => ({ outlets: rankAll([makePickerOutlet({ id: 'a' })]) })}
        onSelect={jest.fn()}
        welcome={null}
      />
    )
    const surface = screen.getByTestId('welcome-surface')
    expect(surface.style.backgroundColor).toBe('')
    expect(surface.className).toContain('bg-background')
  })
})
