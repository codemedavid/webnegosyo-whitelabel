/**
 * Which `orders.source` each channel writes. Reports read the column through
 * `toSaleChannel`, so an app order must land as 'mobile' ("Customer app") and
 * a web order must keep 'web' exactly as before the app existed.
 */

import { describe, test, expect } from '@jest/globals'
import { buildOrderParityColumns } from '@/lib/order-parity'
import { toSaleChannel } from '@/lib/dashboard/sale-record'
import { ORDER_SOURCE_BY_CHANNEL } from '@/lib/checkout/place-order/types'

describe('order source per channel', () => {
  test('the platform parity columns default to web', () => {
    expect(buildOrderParityColumns([{ quantity: 1 }], {}).source).toBe('web')
  })

  test('the platform parity columns carry the source they are given', () => {
    expect(buildOrderParityColumns([{ quantity: 1 }], { source: 'mobile' }).source).toBe('mobile')
  })

  test('Reports attribute each channel the way the app expects', () => {
    expect(toSaleChannel(ORDER_SOURCE_BY_CHANNEL.app)).toBe('app')
    expect(toSaleChannel(ORDER_SOURCE_BY_CHANNEL.web)).toBe('online')
  })
})
