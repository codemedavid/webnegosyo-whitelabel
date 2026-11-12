import type { AppPaymentMethod } from '@/lib/contract'
import { availablePaymentMethods } from './payments'

const method = (id: string, kind: AppPaymentMethod['kind'], orderTypeIds: string[] = []): AppPaymentMethod => ({
  id,
  name: id,
  kind,
  instructions: null,
  requiresProof: false,
  orderTypeIds,
})

describe('availablePaymentMethods', () => {
  const methods = [
    method('online', 'online', ['ot-pickup', 'ot-delivery']),
    method('gcash', 'manual', ['ot-pickup', 'ot-delivery']),
    method('cash', 'cash', ['ot-pickup', 'ot-dine']),
    method('unlinked', 'manual'),
  ]
  const ids = (found: AppPaymentMethod[]) => found.map((candidate) => candidate.id)

  it('offers everything linked to the order type when the store takes online payments', () => {
    expect(ids(availablePaymentMethods(methods, true, 'ot-pickup'))).toEqual(['online', 'gcash', 'cash'])
  })

  it('hides online payment when the store has not switched it on', () => {
    expect(ids(availablePaymentMethods(methods, false, 'ot-pickup'))).toEqual(['gcash', 'cash'])
  })

  it('hides a method the store did not link to this order type', () => {
    expect(ids(availablePaymentMethods(methods, true, 'ot-delivery'))).toEqual(['online', 'gcash'])
  })

  // The web checkout and the server (choosePaymentMethod) offer a method only for the types it is linked to.
  it('never offers a method linked to no order type', () => {
    expect(ids(availablePaymentMethods(methods, true, 'ot-dine'))).toEqual(['cash'])
  })

  it('offers nothing while no order type is known', () => {
    expect(ids(availablePaymentMethods(methods, true, undefined))).toEqual([])
  })
})
