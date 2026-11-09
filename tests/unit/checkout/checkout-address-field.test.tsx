import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

jest.mock('next/dynamic', () => () => {
  function StubAddressField(props: { biasCenter: { lat: number; lng: number } | null; placeholder: string }) {
    return <p>address field near {props.biasCenter ? `${props.biasCenter.lat},${props.biasCenter.lng}` : 'nowhere'}</p>
  }
  return StubAddressField
})

const TENANT = { name: 'Brew Café', restaurant_latitude: 14.6255, restaurant_longitude: 121.0672, lalamove_market: 'PH', mapbox_enabled: true }
const BRANCH = { id: 'b1', name: 'Tanauan branch', address: 'Gonzales St', latitude: 14.09, longitude: 121.14, delivery_radius_km: null }

async function renderField(options: { fieldNames?: string[]; selectedOutletId?: string | null } = {}) {
  const { CheckoutAddressField } = await import('@/components/customer/checkout-templates/checkout-address-field')
  const seen: Array<Record<string, string>> = []
  function Harness() {
    const [customerData, setCustomerData] = useState<Record<string, string>>({})
    seen.push(customerData)
    const checkout = {
      customerData,
      setCustomerData,
      tenant: TENANT,
      formFields: (options.fieldNames ?? ['delivery_address']).map((name, index) => ({ id: String(index), field_name: name })),
      outlet: { choices: [{ outlet: BRANCH, distanceKm: null }], selectedOutletId: options.selectedOutletId ?? null },
    } as unknown as UseCheckoutReturn
    return <CheckoutAddressField checkout={checkout} fieldName="delivery_address" isRequired inputClassName="" labelClassName="" />
  }
  render(<Harness />)
  return seen
}

describe('CheckoutAddressField', () => {
  it('leans the search on the chosen branch, else the store', async () => {
    await renderField({ selectedOutletId: 'b1' })
    expect(screen.getByText('address field near 14.09,121.14')).toBeInTheDocument()
  })

  it('leans on the store when no branch is chosen', async () => {
    await renderField()
    expect(screen.getByText('address field near 14.6255,121.0672')).toBeInTheDocument()
  })

  it('asks for unit, landmark and a note to the rider, stored under fixed keys', async () => {
    const seen = await renderField()
    fireEvent.change(screen.getByLabelText(/Landmark/), { target: { value: 'Blue gate' } })
    fireEvent.change(screen.getByLabelText(/House \/ Blk/), { target: { value: '5B' } })
    fireEvent.change(screen.getByLabelText(/Note to rider/), { target: { value: 'Call me' } })
    expect(seen[seen.length - 1]).toEqual({ delivery_landmark: 'Blue gate', delivery_unit: '5B', delivery_rider_note: 'Call me' })
  })

  it('does not ask twice when the store already has its own landmark question', async () => {
    await renderField({ fieldNames: ['delivery_address', 'Nearest Landmark'] })
    expect(screen.queryByLabelText(/Landmark/)).toBeNull()
    expect(screen.getByLabelText(/Note to rider/)).toBeInTheDocument()
  })
})

describe('saved addresses', () => {
  const SAVED = [{ address: 'Camella Tanza', lat: 14.39, lng: 120.85, unit: 'Blk 4 Lot 12', riderNote: 'Blue gate' }]

  beforeEach(() => window.localStorage.setItem('wn-delivery-addresses:brew', JSON.stringify(SAVED)))
  afterEach(() => window.localStorage.clear())

  async function renderSaved(extra: Record<string, unknown> = {}) {
    const { CheckoutAddressField } = await import('@/components/customer/checkout-templates/checkout-address-field')
    const seen: Array<Record<string, string>> = []
    function Harness() {
      const [customerData, setCustomerData] = useState<Record<string, string>>({})
      seen.push(customerData)
      const checkout = {
        customerData,
        setCustomerData,
        tenant: { ...TENANT, slug: 'brew' },
        formFields: [{ id: '0', field_name: 'delivery_address' }],
        outlet: { choices: [], selectedOutletId: null },
        ...extra,
      } as unknown as UseCheckoutReturn
      return <CheckoutAddressField checkout={checkout} fieldName="delivery_address" isRequired inputClassName="" labelClassName="" />
    }
    render(<Harness />)
    return seen
  }

  it('fills the address, pin and details in one tap', async () => {
    const seen = await renderSaved()
    fireEvent.click(await screen.findByRole('button', { name: 'Blk 4 Lot 12, Camella Tanza' }))
    expect(seen[seen.length - 1]).toMatchObject({
      delivery_address: 'Camella Tanza',
      delivery_lat: '14.39',
      delivery_lng: '120.85',
      delivery_pin_confirmed: 'true',
      delivery_pin_source: 'saved',
      delivery_unit: 'Blk 4 Lot 12',
      delivery_rider_note: 'Blue gate',
    })
    expect(screen.queryByRole('region', { name: 'Your saved addresses' })).toBeNull()
  })

  it('forgets one on this device', async () => {
    await renderSaved()
    fireEvent.click(await screen.findByRole('button', { name: 'Forget Camella Tanza' }))
    expect(screen.queryByRole('region', { name: 'Your saved addresses' })).toBeNull()
    expect(window.localStorage.getItem('wn-delivery-addresses:brew')).toBe('[]')
  })

  it('never offers them on a counter tablet', async () => {
    await renderSaved({ isKiosk: true })
    expect(screen.queryByRole('region', { name: 'Your saved addresses' })).toBeNull()
  })
})

describe("I can't find my place", () => {
  async function renderPinRequired(tenant: Record<string, unknown>, initial: Record<string, string>) {
    const { CheckoutAddressField } = await import('@/components/customer/checkout-templates/checkout-address-field')
    const seen: Array<Record<string, string>> = []
    function Harness() {
      const [customerData, setCustomerData] = useState<Record<string, string>>(initial)
      seen.push(customerData)
      const checkout = {
        customerData,
        setCustomerData,
        tenant: { ...TENANT, ...tenant },
        formFields: [{ id: '0', field_name: 'delivery_address' }],
        outlet: { choices: [], selectedOutletId: null },
      } as unknown as UseCheckoutReturn
      return <CheckoutAddressField checkout={checkout} fieldName="delivery_address" isRequired inputClassName="" labelClassName="" />
    }
    render(<Harness />)
    return seen
  }

  it('is offered where a pin is needed, and says what happens next', async () => {
    const seen = await renderPinRequired({ lalamove_enabled: true }, { delivery_address: 'Purok 3' })
    fireEvent.click(screen.getByRole('button', { name: "I can't find my place on the map" }))
    expect(seen[seen.length - 1].delivery_pin_skipped).toBe('true')
    expect(screen.getByRole('status')).toHaveTextContent('The store will call you')

    fireEvent.click(screen.getByRole('button', { name: 'Try the map again' }))
    expect(seen[seen.length - 1].delivery_pin_skipped).toBeUndefined()
  })

  it('is not offered where a pin is optional, or once there is one', async () => {
    await renderPinRequired({}, { delivery_address: 'Purok 3' })
    expect(screen.queryByRole('button', { name: "I can't find my place on the map" })).toBeNull()
  })

  it('is not offered with a pin', async () => {
    await renderPinRequired({ lalamove_enabled: true }, { delivery_address: 'Purok 3', delivery_lat: '14.5', delivery_lng: '121' })
    expect(screen.queryByRole('button', { name: "I can't find my place on the map" })).toBeNull()
  })
})

describe('buildDeliveryPinCheck', () => {
  it('words each warning for the customer', async () => {
    const { buildDeliveryPinCheck } = await import('@/components/customer/checkout-templates/checkout-address-field')
    const check = buildDeliveryPinCheck({ origin: { lat: 14.6255, lng: 121.0672 }, radiusKm: null, market: 'PH', lalamoveEnabled: true, placeName: 'Brew Café' })

    expect(check({ lat: 14.65, lng: 121.05 })).toBeNull()
    expect(check({ lat: 14.6255, lng: 121.0672 })).toEqual({ isBlocked: false, message: 'This pin is on Brew Café itself. Move it to your address.' })
    expect(check({ lat: 7.07, lng: 125.61 })?.message).toMatch(/^This pin is \d+ km from Brew Café\. Is that right\?$/)
    expect(check({ lat: 22.3, lng: 114.17 })).toEqual({
      isBlocked: true,
      message: 'This spot is outside the Philippines. Move the pin to your delivery address.',
    })
  })

  it('reads a stale Lalamove market on a store without Lalamove as the Philippines', async () => {
    const { buildDeliveryPinCheck } = await import('@/components/customer/checkout-templates/checkout-address-field')
    const check = buildDeliveryPinCheck({ origin: null, radiusKm: null, market: 'HK', lalamoveEnabled: false, placeName: 'Brew Café' })
    expect(check({ lat: 22.3, lng: 114.17 })?.isBlocked).toBe(true)
    expect(check({ lat: 14.65, lng: 121.05 })).toBeNull()
  })
})
