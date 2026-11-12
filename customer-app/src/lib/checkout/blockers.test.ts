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
  hasPaymentMethods: true,
  needsPaymentReference: false,
  paymentReference: '',
  hasDeliveryPlace: false,
  deliveryFee: 'ready' as const,
  deliveryRefusal: null,
  voucher: 'none' as const,
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

  // The web checkout places the order without a method when the order type offers none.
  it('does not ask how to pay when the store offers no payment method', () => {
    expect(checkoutBlockers({ ...ready, paymentMethodId: null, hasPaymentMethods: false })).toEqual([])
  })

  it('needs a branch on multi-branch stores and an order type the store offers', () => {
    expect(checkoutBlockers({ ...ready, outlet: undefined })).toEqual(['Choose a branch'])
    expect(checkoutBlockers({ ...ready, outlet: undefined, needsOutlet: false })).toEqual([])
    expect(checkoutBlockers({ ...ready, orderType: undefined })).toEqual(['This store is not taking pick up orders'])
  })

  const delivery = { ...ready, mode: 'delivery' as const, orderType: orderTypes[1], outlet: undefined, needsOutlet: false, hasDeliveryPlace: true }

  it('never lets a delivery order go out on an unconfirmed fee', () => {
    expect(checkoutBlockers({ ...delivery, deliveryFee: 'ready' })).toEqual([])
    expect(checkoutBlockers({ ...delivery, deliveryFee: 'quoting' })).toEqual(['Getting the delivery fee…'])
    expect(checkoutBlockers({ ...delivery, deliveryFee: 'failed' })).toEqual(['We couldn’t price delivery to this address'])
  })

  it('says the store’s own words when it won’t deliver there', () => {
    expect(checkoutBlockers({ ...delivery, deliveryFee: 'refused', deliveryRefusal: 'We only deliver within 5 km.' })).toEqual(['We only deliver within 5 km.'])
    expect(checkoutBlockers({ ...delivery, deliveryFee: 'refused' })).toEqual(['This branch doesn’t deliver to that address'])
  })

  it('needs a picked place: no place, no delivery, whatever the fee says', () => {
    expect(checkoutBlockers({ ...delivery, hasDeliveryPlace: false })).toEqual(['Add a delivery address'])
    expect(checkoutBlockers({ ...delivery, hasDeliveryPlace: false, deliveryFee: 'failed' })).toEqual(['Add a delivery address'])
  })

  it('needs a reference number for a method that requires proof', () => {
    const proof = { ...ready, paymentMethodId: 'pm-gcash', needsPaymentReference: true }
    expect(checkoutBlockers({ ...proof, paymentReference: '   ' })).toEqual(['Add your payment reference number'])
    expect(checkoutBlockers({ ...proof, paymentReference: '0123 4567 89' })).toEqual([])
    expect(checkoutBlockers({ ...ready, paymentReference: '' })).toEqual([])
  })

  it('waits for the voucher’s answer and stops on one it could not get', () => {
    expect(checkoutBlockers({ ...ready, voucher: 'checking' })).toEqual(['Checking your voucher…'])
    expect(checkoutBlockers({ ...ready, voucher: 'failed' })).toEqual(['We couldn’t check your voucher. Try again or remove it'])
    for (const voucher of ['none', 'applied', 'notApplied', 'invalid'] as const) expect(checkoutBlockers({ ...ready, voucher })).toEqual([])
  })

  it('asks a member without a name to add one (stores call orders out by name)', () => {
    expect(checkoutBlockers({ ...ready, hasName: false })).toEqual(['Add your name'])
  })

  it('asks for the store’s required questions before the payment reference', () => {
    expect(checkoutBlockers({ ...ready, unansweredQuestions: ['Answer “Pickup date”'] })).toEqual(['Answer “Pickup date”'])
  })

  it('ignores the fee for pick up and dine in', () => {
    expect(checkoutBlockers({ ...ready, deliveryFee: 'failed' })).toEqual([])
  })
})
