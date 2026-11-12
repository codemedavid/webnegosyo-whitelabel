import { orderIdFromPushData, routeFromPushData } from './push-data'

describe('routeFromPushData', () => {
  it('opens the order an order push is about', () => {
    expect(routeFromPushData({ kind: 'order', orderId: 'abc-123', status: 'ready' })).toBe('/order/abc-123')
    expect(orderIdFromPushData({ kind: 'order', orderId: 'abc-123', status: 'ready' })).toBe('abc-123')
  })

  it('escapes the id so a payload can never steer to another screen', () => {
    expect(routeFromPushData({ kind: 'order', orderId: '../sign-in?x=1', status: 'ready' })).toBe('/order/..%2Fsign-in%3Fx%3D1')
  })

  it('ignores anything that is not an order push the server built', () => {
    for (const data of [null, undefined, 'x', {}, { kind: 'promo', url: 'https://example.com' }, { kind: 'order', orderId: '' , status: 'ready' }, { kind: 'order', orderId: 'a', status: 'preparing' }]) {
      expect(routeFromPushData(data)).toBeNull()
      expect(orderIdFromPushData(data)).toBeNull()
    }
  })
})
