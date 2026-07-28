import { describe, it, expect, jest } from '@jest/globals'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { OutletModeScreen } from '@/components/customer/outlet-mode-screen'
import {
  OutletPickerScreen,
  type PickerOutlet,
} from '@/components/customer/outlet-picker-screen'
import type { RankedOutlet } from '@/lib/outlets/nearest-outlet'

/**
 * The two screens of the branch chooser, tested through what a customer sees
 * and can press. The decisions behind the labels live in `outlet-card.ts` and
 * `outlet-modes.ts` and are covered there; what these tests protect is the
 * wiring — that pressing a tile reports the mode, that pressing a card reports
 * the branch, and that a card with missing data still renders something usable
 * rather than an empty box or a dead link.
 */

// 9:00–21:40 daily, Manila. 2026-07-28T04:00Z is midday Tuesday in Manila.
const HOURS = Object.fromEntries(
  Array.from({ length: 7 }, (_, day) => [String(day), { closed: false, open: '09:00', close: '21:40' }])
)
const MIDDAY = new Date('2026-07-28T04:00:00Z')

function makePickerOutlet(overrides: Partial<PickerOutlet> & { id: string }): PickerOutlet {
  return {
    slug: overrides.id,
    name: overrides.id,
    address: null,
    image_url: null,
    operating_hours: HOURS,
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

function rank(
  outlet: PickerOutlet,
  overrides: Partial<RankedOutlet<PickerOutlet>> = {}
): RankedOutlet<PickerOutlet> {
  return { outlet, distanceKm: null, withinDeliveryRadius: true, ...overrides }
}

const STA_LUCIA = makePickerOutlet({
  id: 'sta-lucia',
  name: 'Sta. Lucia Mall Il Centro',
  address: 'Marcos Highway, Cainta, Rizal',
  image_url: 'https://ik.example/sta-lucia.jpg',
})

const TELEPERFORMANCE = makePickerOutlet({
  id: 'tele',
  name: 'Teleperformance Center',
  address: 'Ayala Avenue, Makati City',
})

describe('OutletModeScreen', () => {
  const baseProps = {
    tenantName: 'ZUS Coffee',
    modes: ['dine_in', 'pickup', 'delivery'] as const,
    onSelect: () => {},
  }

  it('offers a tile for every available mode', () => {
    // Arrange / Act
    render(<OutletModeScreen {...baseProps} />)

    // Assert
    expect(screen.getByRole('button', { name: /dine in/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pickup/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delivery/i })).toBeInTheDocument()
  })

  it('reports the mode the customer pressed', () => {
    const onSelect = jest.fn()
    render(<OutletModeScreen {...baseProps} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /dine in/i }))

    expect(onSelect).toHaveBeenCalledWith('dine_in')
  })

  it('shows no tile for a mode no branch supports', () => {
    render(<OutletModeScreen {...baseProps} modes={['pickup']} />)

    expect(screen.queryByRole('button', { name: /dine in/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delivery/i })).not.toBeInTheDocument()
  })

  it('falls back to the tenant name when the merchant set no headline', () => {
    render(<OutletModeScreen {...baseProps} />)

    expect(screen.getByRole('heading')).toHaveTextContent('ZUS Coffee')
  })

  it('explains why it is asking again when a reason was given', () => {
    render(<OutletModeScreen {...baseProps} message="The branch you chose last time is closed." />)

    expect(screen.getByText(/chose last time is closed/i)).toBeInTheDocument()
  })

  it('says so rather than rendering an empty screen when no mode is available', () => {
    render(<OutletModeScreen {...baseProps} modes={[]} />)

    expect(screen.getByText(/none of our branches/i)).toBeInTheDocument()
  })

  it('renders no promo image element when the merchant set none', () => {
    render(<OutletModeScreen {...baseProps} promoImageUrl={null} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('OutletPickerScreen', () => {
  const baseProps = {
    mode: 'pickup' as const,
    ranked: [rank(STA_LUCIA), rank(TELEPERFORMANCE)],
    isLocating: false,
    onLocate: () => {},
    onBack: () => {},
    onSelect: () => {},
    now: MIDDAY,
  }

  it('lists every branch it was given', () => {
    render(<OutletPickerScreen {...baseProps} />)

    expect(screen.getByText('Sta. Lucia Mall Il Centro')).toBeInTheDocument()
    expect(screen.getByText('Teleperformance Center')).toBeInTheDocument()
  })

  it('reports the branch the customer pressed', () => {
    const onSelect = jest.fn()
    render(<OutletPickerScreen {...baseProps} onSelect={onSelect} />)

    fireEvent.click(screen.getByText('Teleperformance Center'))

    expect(onSelect).toHaveBeenCalledWith('tele')
  })

  it('shows the open status and closing time', () => {
    render(<OutletPickerScreen {...baseProps} ranked={[rank(STA_LUCIA)]} />)

    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText(/closes 9:40 pm/i)).toBeInTheDocument()
  })

  it('shows the branch address next to a pin', () => {
    render(<OutletPickerScreen {...baseProps} ranked={[rank(STA_LUCIA)]} />)

    expect(screen.getByText('Marcos Highway, Cainta, Rizal')).toBeInTheDocument()
  })

  it('links Get Direction safely, opening away from the storefront', () => {
    render(<OutletPickerScreen {...baseProps} ranked={[rank(STA_LUCIA)]} />)

    const link = screen.getByRole('link', { name: /get direction/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('https://'))
    // Without noopener the map tab can navigate the storefront it came from.
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('renders a photo when the branch has one and a placeholder when it does not', () => {
    const { rerender } = render(
      <OutletPickerScreen {...baseProps} ranked={[rank(STA_LUCIA)]} />
    )
    expect(screen.getByRole('img', { name: 'Sta. Lucia Mall Il Centro' })).toBeInTheDocument()

    rerender(<OutletPickerScreen {...baseProps} ranked={[rank(TELEPERFORMANCE)]} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    // The branch is still choosable without a photo.
    expect(screen.getByText('Teleperformance Center')).toBeInTheDocument()
  })

  it('narrows the list as the customer types, matching on address', () => {
    render(<OutletPickerScreen {...baseProps} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'makati' } })

    expect(screen.getByText('Teleperformance Center')).toBeInTheDocument()
    expect(screen.queryByText('Sta. Lucia Mall Il Centro')).not.toBeInTheDocument()
  })

  it('says nothing matched rather than silently showing everything', () => {
    render(<OutletPickerScreen {...baseProps} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cebu' } })

    expect(screen.getByText(/no branches match/i)).toBeInTheDocument()
    expect(screen.queryByText('Teleperformance Center')).not.toBeInTheDocument()
  })

  it('goes back to the mode screen when a step back exists', () => {
    const onBack = jest.fn()
    render(<OutletPickerScreen {...baseProps} onBack={onBack} />)

    fireEvent.click(screen.getByRole('button', { name: /back to order type/i }))

    expect(onBack).toHaveBeenCalled()
  })

  it('renders no back control when the mode was forced', () => {
    // A tenant offering one mode never showed the tile screen, so there is
    // nothing to go back to — and a button that does nothing is worse than none.
    render(<OutletPickerScreen {...baseProps} onBack={null} />)

    expect(screen.queryByRole('button', { name: /back to order type/i })).not.toBeInTheDocument()
  })

  it('disables a branch that cannot deliver to the customer, and says why', () => {
    render(
      <OutletPickerScreen
        {...baseProps}
        mode="delivery"
        ranked={[rank(STA_LUCIA, { withinDeliveryRadius: false, distanceKm: 42 })]}
      />
    )

    expect(screen.getByText(/outside this branch/i)).toBeInTheDocument()
    expect(screen.getByText('Sta. Lucia Mall Il Centro').closest('button')).toBeDisabled()
  })

  it('never disables a dine-in branch for being far away', () => {
    // The customer is proposing to walk in; distance is information, not a gate.
    render(
      <OutletPickerScreen
        {...baseProps}
        mode="dine_in"
        ranked={[rank(STA_LUCIA, { withinDeliveryRadius: false, distanceKm: 42 })]}
      />
    )

    expect(screen.getByText('Sta. Lucia Mall Il Centro').closest('button')).not.toBeDisabled()
    expect(screen.queryByText(/outside this branch/i)).not.toBeInTheDocument()
  })

  it('asks the browser for a location when the locate control is pressed', () => {
    const onLocate = jest.fn()
    render(<OutletPickerScreen {...baseProps} onLocate={onLocate} />)

    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))

    expect(onLocate).toHaveBeenCalled()
  })
})
