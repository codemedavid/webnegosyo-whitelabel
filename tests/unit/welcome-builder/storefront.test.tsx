import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import { createWidget } from '@/lib/hero-builder/defaults'
import type { HeroDesignV5, Widget } from '@/lib/hero-builder/types'
import type { PickerOutlet } from '@/components/customer/outlet-picker-screen'
import type { RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { Outlet, Tenant } from '@/types/database'

import { column, designOf, section } from '../hero-builder/helpers'

/**
 * The published Welcome Builder page, as a customer meets it: on the branch
 * chooser (multi-branch) and as a once-per-visit front door (single store).
 * Every way in must lead somewhere real.
 */

const mockSetOrderType = jest.fn()
jest.mock('@/hooks/useCart', () => ({ useCart: () => ({ setOrderType: mockSetOrderType }) }))
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
jest.mock('@/lib/order-types-client', () => ({
  getEnabledOrderTypesByTenantClient: jest.fn(async () => [
    { id: 'ot-pickup', type: 'pickup', is_enabled: true, available_on_web: true, order_index: 0 },
    { id: 'ot-delivery', type: 'delivery', is_enabled: true, available_on_web: true, order_index: 1 },
  ]),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const chain = { eq: () => chain, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) }
        return chain
      },
    }),
  }),
}))

function buttonTo(label: string, href: string): Widget {
  const base = createWidget('buttons')
  return { ...base, content: { kind: 'buttons', items: [{ id: `b-${label}`, label, href, newTab: false, variant: 'solid' }] } }
}

function headingOf(text: string): Widget {
  const base = createWidget('heading')
  return { ...base, content: { kind: 'heading', text, tag: 'h1' } }
}

const pageDesign = (): HeroDesignV5 =>
  designOf([
    section('s', [
      column('c', [
        headingOf('Welcome to {store}'),
        createWidget('order-entry'),
        buttonTo('See the menu', '#storefront-menu'),
        buttonTo('Deliver it', '#welcome-mode-delivery'),
      ]),
    ]),
  ])

describe('CustomWelcomePage', () => {
  async function renderPage(modes: readonly ('dine_in' | 'pickup' | 'delivery')[] = ['dine_in', 'pickup']) {
    const { CustomWelcomePage } = await import('@/components/customer/custom-welcome-page')
    const onChooseMode = jest.fn()
    const onStart = jest.fn()
    render(
      <CustomWelcomePage design={pageDesign()} storeName="Gungjeon" logoUrl={null} modes={modes} message="That branch is closed." onChooseMode={onChooseMode} onStart={onStart} />,
    )
    return { onChooseMode, onStart }
  }

  it('greets with the store name and keeps the "why again" notice', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Welcome to Gungjeon' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('That branch is closed.')
  })

  it('offers only the available order types, and reports the one pressed', async () => {
    const { onChooseMode } = await renderPage()
    expect(screen.queryByRole('button', { name: /delivery/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /pickup/i }))
    expect(onChooseMode).toHaveBeenCalledWith('pickup')
  })

  it('turns a menu link into "start ordering" — there is no menu before a branch', async () => {
    const { onStart } = await renderPage()
    fireEvent.click(screen.getByRole('link', { name: 'See the menu' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('starts a plain order when a per-type link names an unavailable type', async () => {
    const { onStart, onChooseMode } = await renderPage(['pickup'])
    fireEvent.click(screen.getByRole('link', { name: 'Deliver it' }))
    expect(onChooseMode).not.toHaveBeenCalled()
    expect(onStart).toHaveBeenCalled()
  })

  it('shows the start button when no order type is available at all', async () => {
    const { onStart } = await renderPage([])
    fireEvent.click(screen.getByRole('button', { name: 'Start ordering' }))
    expect(onStart).toHaveBeenCalled()
  })
})

const rankAll = (outlets: readonly PickerOutlet[]): RankedOutlet<PickerOutlet>[] =>
  outlets.map((outlet) => ({ outlet, distanceKm: null, withinDeliveryRadius: true }))

function pickerOutlet(id: string): PickerOutlet {
  return {
    id, slug: id, name: id, address: null, image_url: null, operating_hours: null, timezone: 'Asia/Manila',
    latitude: null, longitude: null, delivery_radius_km: null, supports_pickup: true, supports_delivery: true,
    supports_dine_in: true, is_active: true, sort_order: 0,
  }
}

describe('OutletSplash with a published welcome page', () => {
  const live = { welcome_design: JSON.stringify(pageDesign()), welcome_design_enabled: true }

  async function renderSplash(welcome: Record<string, unknown>) {
    const { OutletSplash } = await import('@/components/customer/outlet-splash')
    const outlets = [pickerOutlet('valenzuela'), pickerOutlet('cainta')]
    const onSelect = jest.fn()
    const rankFor = jest.fn(() => ({ outlets: rankAll(outlets) }))
    render(
      <OutletSplash tenantName="Gungjeon" outlets={outlets} reason={null} isLocating={false} onLocate={jest.fn()} rankFor={rankFor} onSelect={onSelect} welcome={welcome} />,
    )
    return { onSelect, rankFor }
  }

  it('replaces the classic screen and carries the chosen order type to the branch', async () => {
    const { onSelect, rankFor } = await renderSplash(live)
    expect(screen.getByTestId('custom-welcome-page')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /delivery/i }))
    expect(rankFor).toHaveBeenLastCalledWith('delivery')
    fireEvent.click(screen.getByRole('button', { name: /cainta/i }))
    expect(onSelect).toHaveBeenCalledWith('cainta', 'delivery')
  })

  it('lets a start link open the branch list even when the classic entry was tiles-only', async () => {
    const { onSelect } = await renderSplash({ ...live, welcome_entry_mode: 'order_types' })
    fireEvent.click(screen.getByRole('link', { name: 'See the menu' }))
    fireEvent.click(screen.getByRole('button', { name: /valenzuela/i }))
    expect(onSelect).toHaveBeenCalledWith('valenzuela', null)
  })

  it('keeps the classic screen while the page is switched off', async () => {
    await renderSplash({ ...live, welcome_design_enabled: false })
    expect(screen.queryByTestId('custom-welcome-page')).not.toBeInTheDocument()
    expect(screen.getByText('Welcome to Gungjeon')).toBeInTheDocument()
  })
})

describe('OutletGate — single-location stores get the welcome page once per visit', () => {
  const tenant = {
    id: 't1', name: 'Kape Tayo', logo_url: '', multi_branch_enabled: false,
    welcome_design: JSON.stringify(pageDesign()), welcome_design_enabled: true,
  } as unknown as Tenant
  const outlets: Outlet[] = []

  beforeEach(() => {
    window.sessionStorage.clear()
    mockSetOrderType.mockClear()
  })

  const renderGate = async (t: Tenant) => {
    const { OutletGate } = await import('@/components/customer/outlet-gate')
    return render(<OutletGate tenant={t} tenantSlug="kape" outlets={outlets} />)
  }

  it('shows nothing for a store that never published a welcome page', async () => {
    await renderGate({ ...tenant, welcome_design_enabled: false } as Tenant)
    expect(screen.queryByTestId('welcome-landing')).not.toBeInTheDocument()
  })

  it('sets the chosen order type and opens the menu', async () => {
    await renderGate(tenant)
    const pickup = await screen.findByRole('button', { name: /pickup/i })
    fireEvent.click(pickup)
    expect(mockSetOrderType).toHaveBeenCalledWith('ot-pickup')
    await waitFor(() => expect(screen.queryByTestId('welcome-landing')).not.toBeInTheDocument())
    expect(window.sessionStorage.getItem('wn-welcome-seen:kape')).toBe('1')
  })

  it('does not greet the same visitor twice in one session', async () => {
    window.sessionStorage.setItem('wn-welcome-seen:kape', '1')
    await renderGate(tenant)
    expect(screen.queryByTestId('welcome-landing')).not.toBeInTheDocument()
  })

  it('stays out of the way of a table QR scan', async () => {
    window.history.pushState({}, '', '/kape/menu?table=5')
    try {
      await renderGate(tenant)
      expect(screen.queryByTestId('welcome-landing')).not.toBeInTheDocument()
    } finally {
      window.history.pushState({}, '', '/')
    }
  })

  it('holds the choices\' place while order types load, with nothing to tap', async () => {
    await renderGate(tenant)
    expect(screen.queryByRole('button', { name: /pickup/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start ordering/i })).not.toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /pickup/i })).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
  })

  it('server HTML hides itself before paint for a visitor who already went in', async () => {
    const { renderToString } = await import('react-dom/server')
    const { OutletGate } = await import('@/components/customer/outlet-gate')
    const html = renderToString(<OutletGate tenant={tenant} tenantSlug="kape" outlets={outlets} />)
    const script = html.match(/<script>(.*?)<\/script>/)?.[1]
    expect(script).toBeDefined()
    expect(html).toContain('data-welcome-slug="kape"')

    const runScript = () => new Function(script as string)()
    runScript()
    expect(document.head.innerHTML).not.toContain('data-welcome-slug')

    window.sessionStorage.setItem('wn-welcome-seen:kape', '1')
    runScript()
    expect(document.head.innerHTML).toContain('[data-welcome-slug="kape"]{display:none!important}')
    document.head.innerHTML = ''
  })

  it('closes on "start ordering" without forcing an order type', async () => {
    await renderGate(tenant)
    await act(async () => {})
    fireEvent.click(screen.getByRole('link', { name: 'See the menu' }))
    expect(mockSetOrderType).not.toHaveBeenCalled()
    expect(screen.queryByTestId('welcome-landing')).not.toBeInTheDocument()
  })
})
