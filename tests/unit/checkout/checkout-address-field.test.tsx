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
    fireEvent.change(screen.getByLabelText(/Unit \/ Floor/), { target: { value: '5B' } })
    fireEvent.change(screen.getByLabelText(/Note to rider/), { target: { value: 'Call me' } })
    expect(seen[seen.length - 1]).toEqual({ delivery_landmark: 'Blue gate', delivery_unit: '5B', delivery_rider_note: 'Call me' })
  })

  it('does not ask twice when the store already has its own landmark question', async () => {
    await renderField({ fieldNames: ['delivery_address', 'Nearest Landmark'] })
    expect(screen.queryByLabelText(/Landmark/)).toBeNull()
    expect(screen.getByLabelText(/Note to rider/)).toBeInTheDocument()
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
