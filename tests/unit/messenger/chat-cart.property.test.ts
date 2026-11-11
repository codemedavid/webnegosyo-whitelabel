/**
 * Whatever a customer taps, in whatever order, the chat cart stays inside its
 * caps, never holds a dish the chat can't sell, and prices to exactly the sum
 * of its lines.
 */
import fc from 'fast-check'
import { applyCartOp, MAX_CART_LINES, MAX_LINE_QTY, priceChatCart, type CartOp, type ChatCartLine } from '@/lib/messenger/chat-cart'
import { propertyParameters } from '../../utils/property'
import { category, dish, sampleStore } from './sample-store'

const store = sampleStore({
  categories: [category('c1', 'Meals', 1)],
  items: [
    ...Array.from({ length: 25 }, (_, index) => dish(`d${index}`, 'c1', index, { price: 10 + index * 7.25 })),
    dish('choice', 'c1', 30, { variations: [{ id: 'v', name: 'Large', price: 5 }] as never }),
    dish('sold', 'c1', 31, { is_available: false }),
  ],
})
const ids = [...store.items.map((item) => item.id), 'choice', 'sold', 'foreign']

const opArb: fc.Arbitrary<CartOp> = fc.oneof(
  fc.record({ kind: fc.constantFrom<'add' | 'inc' | 'dec' | 'remove'>('add', 'inc', 'dec', 'remove'), itemId: fc.constantFrom(...ids) }),
  fc.constant<CartOp>({ kind: 'clear' }),
)

describe('chat cart ops', () => {
  it('stay inside the caps and only ever hold sellable dishes', () => {
    fc.assert(fc.property(fc.array(opArb, { maxLength: 200 }), (ops) => {
      let cart: ChatCartLine[] = []
      for (const op of ops) {
        cart = applyCartOp(cart, op, store).cart
        expect(cart.length).toBeLessThanOrEqual(MAX_CART_LINES)
        expect(new Set(cart.map((line) => line.itemId)).size).toBe(cart.length)
        for (const line of cart) {
          expect(line.qty).toBeGreaterThanOrEqual(1)
          expect(line.qty).toBeLessThanOrEqual(MAX_LINE_QTY)
          expect(['choice', 'sold', 'foreign']).not.toContain(line.itemId)
        }
      }
      const priced = priceChatCart(cart, store)
      expect(priced.totalCentavos).toBe(priced.lines.reduce((sum, line) => sum + line.unitCentavos * line.qty, 0))
      expect(Number.isInteger(priced.totalCentavos)).toBe(true)
      expect(priced.kept.map((line) => [line.itemId, line.qty])).toEqual(cart.map((line) => [line.itemId, line.qty]))
    }), propertyParameters())
  })
})
