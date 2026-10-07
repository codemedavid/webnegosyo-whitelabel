import { summarizeUpsellConversions } from '@/lib/checkout/upsell-conversion'
import type { CartItem } from '@/types/database'

const line = (subtotal: number, upsellSource?: string): CartItem =>
  ({ id: `l-${subtotal}`, subtotal, upsellSource }) as unknown as CartItem

describe('summarizeUpsellConversions', () => {
  it('is null for an order with no upsold lines', () => {
    expect(summarizeUpsellConversions([line(100), line(50)])).toBeNull()
  })

  it('counts upsold lines, sums their revenue and breaks them down by source', () => {
    expect(summarizeUpsellConversions([
      line(100),
      line(40, 'post_add'),
      line(25, 'checkout_modal'),
      line(60, 'post_add'),
    ])).toEqual({
      upsellItemCount: 3,
      upsellRevenue: 125,
      sources: { post_add: 2, checkout_modal: 1 },
    })
  })
})
