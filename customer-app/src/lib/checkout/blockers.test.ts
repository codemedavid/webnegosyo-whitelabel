import type { AppOrderType, AppOutlet } from '@/lib/contract'
import { checkoutBlockers, orderTypeForMode, outletSupportsMode } from './blockers'

const orderTypes: AppOrderType[] = [
  { id: 'ot-pickup', kind: 'pickup', name: 'Pick Up', minimumOrder: 0 },
  { id: 'ot-delivery', kind: 'delivery', name: 'Delivery', minimumOrder: 300 },
  { id: 'ot-dine', kind: 'dine_in', name: 'Dine In', minimumOrder: 0 },
]

const outlet: AppOutlet = {
  id: 'outlet-makati',
  name: 'Salcedo Village',
  address: null,
  imageUrl: null,
  latitude: null,
  longitude: null,
  supportsPickup: true,
  supportsDelivery: false,
  supportsDineIn: true,
}

const ready = {
  itemCount: 2,
  isMember: true,
  mode: 'pickup' as const,
  orderType: orderTypes[0],
  outlet,
  needsOutlet: true,
  paymentMethodId: 'pm-cash',
  deliveryAddress: '',
  hasDeliveryPlace: false,
  deliveryFee: 'ready' as const,
  shortfallCentavos: 0,
}

describe('orderTypeForMode', () => {
  it('maps the app modes onto the store order types', () => {
    expect(orderTypeForMode('dineIn', orderTypes)?.id).toBe('ot-dine')
    expect(orderTypeForMode('delivery', orderTypes)?.id).toBe('ot-delivery')
    expect(orderTypeForMode('pickup', [])).toBeUndefined()
  })
})

describe('outletSupportsMode', () => {
  it('reads the branch flags', () => {
    expect(outletSupportsMode(outlet, 'delivery')).toBe(false)
    expect(outletSupportsMode(outlet, 'dineIn')).toBe(true)
  })
})

describe('checkoutBlockers', () => {
  it('is empty when the order can be placed', () => {
    expect(checkoutBlockers(ready)).toEqual([])
  })

  it('asks a guest to sign in', () => {
    expect(checkoutBlockers({ ...ready, isMember: false })).toEqual(['Sign in to place your order'])
  })

  it('lists every problem, most basic first', () => {
    const blockers = checkoutBlockers({
      ...ready,
      itemCount: 0,
      mode: 'delivery',
      orderType: orderTypes[1],
      paymentMethodId: null,
      deliveryAddress: '  ',
      shortfallCentavos: 6000,
    })
    expect(blockers).toEqual([
      'Your bag is empty',
      'Salcedo Village does not deliver',
      'Add a delivery address',
      'Add ₱60 more for delivery',
      'Choose how to pay',
    ])
  })

  it('needs a branch on multi-branch stores and an order type the store offers', () => {
    expect(checkoutBlockers({ ...ready, outlet: undefined })).toEqual(['Choose a branch'])
    expect(checkoutBlockers({ ...ready, outlet: undefined, needsOutlet: false })).toEqual([])
    expect(checkoutBlockers({ ...ready, orderType: undefined })).toEqual(['This store is not taking pick up orders'])
  })

  it('never lets a delivery order go out on an unconfirmed fee', () => {
    const delivery = { ...ready, mode: 'delivery' as const, orderType: orderTypes[1], outlet: undefined, needsOutlet: false, deliveryAddress: '12 Rizal St', hasDeliveryPlace: true }
    expect(checkoutBlockers({ ...delivery, deliveryFee: 'ready' })).toEqual([])
    expect(checkoutBlockers({ ...delivery, deliveryFee: 'unconfirmed' })).toEqual(['Confirm your address to see the delivery fee'])
    expect(checkoutBlockers({ ...delivery, deliveryFee: 'quoting' })).toEqual(['Getting the delivery fee…'])
    expect(checkoutBlockers({ ...delivery, deliveryFee: 'failed' })).toEqual(['We couldn’t price delivery to this address'])
  })

  it('never delivers to typed text: the address must be picked from the search', () => {
    const typed = { ...ready, mode: 'delivery' as const, orderType: orderTypes[1], outlet: undefined, needsOutlet: false, deliveryAddress: '12 Rizal St' }
    expect(checkoutBlockers(typed)).toEqual(['Pick your address from the search results'])
    expect(checkoutBlockers({ ...typed, deliveryFee: 'failed' })).toEqual(['Pick your address from the search results'])
  })

  it('ignores the fee for pick up and dine in', () => {
    expect(checkoutBlockers({ ...ready, deliveryFee: 'failed' })).toEqual([])
  })
})
