/**
 * The cart page stepper stops where the kitchen's stock does (client: "if 5
 * left and someone orders 7 it should warn"). Composed in useCartCommands, so
 * the cart page, every cart design and the drawer all get it.
 */
import { renderHook } from '@testing-library/react'
import type { CartItem } from '@/types/database'

let mockCeilings = new Map<string, number>()
const ceilingReads: Array<[unknown, unknown]> = []
jest.mock('@/hooks/use-stock-ceilings', () => ({
  useStockCeilings: (tenantId: unknown, outletId: unknown) => {
    ceilingReads.push([tenantId, outletId])
    return tenantId ? mockCeilings : new Map()
  },
  selectCeiling: (ceilings: Map<string, number>, id: string) => ceilings.get(id) ?? null,
}))
jest.mock('@/hooks/use-presell-cart-caps', () => ({
  usePresellCartCaps: () => ({ canIncreaseItem: () => true, presellHintFor: () => null }),
}))

const line = (id: string, menuItemId: string, quantity: number) =>
  ({ id, menu_item: { id: menuItemId }, quantity }) as unknown as CartItem

const cart = (items: CartItem[]) => ({
  items, updateQuantity: jest.fn(), removeItem: jest.fn(), updateItemConfiguration: jest.fn(),
  updateBundleQuantity: jest.fn(), removeBundleFromCart: jest.fn(),
})

async function commandsFor(items: CartItem[], isInventoryEnabled = true) {
  const { useCartCommands } = await import('@/storefront/cart/use-cart-commands')
  return renderHook(() => useCartCommands({ tenantId: 't1', tenantSlug: 'lolys', isInventoryEnabled, cart: cart(items) as never })).result.current
}

beforeEach(() => {
  mockCeilings = new Map()
  ceilingReads.length = 0
  window.localStorage.clear()
})

describe('the cart page stepper and stock', () => {
  it('stops "+" at the ceiling and says so', async () => {
    mockCeilings = new Map([['tapsi', 5]])
    const items = [line('l1', 'tapsi', 5)]
    const commands = await commandsFor(items)

    expect(commands.canIncreaseItem(items[0])).toBe(false)
    expect(commands.stockHintFor(items[0])).toBe('That’s all we can make today')
  })

  it('warns when the cart holds more than the kitchen can make (5 left, 7 in the cart)', async () => {
    mockCeilings = new Map([['tapsi', 5]])
    const items = [line('l1', 'tapsi', 4), line('l2', 'tapsi', 3)]
    const commands = await commandsFor(items)

    expect(commands.canIncreaseItem(items[1])).toBe(false)
    expect(commands.stockHintFor(items[1])).toBe('Only 5 left — lower to 5 to check out')
  })

  it('says "Only N left" and still allows more below the ceiling', async () => {
    mockCeilings = new Map([['tapsi', 5]])
    const items = [line('l1', 'tapsi', 3)]
    const commands = await commandsFor(items)

    expect(commands.canIncreaseItem(items[0])).toBe(true)
    expect(commands.stockHintFor(items[0])).toBe('Only 2 left')
  })

  it('leaves an untracked dish exactly as before', async () => {
    const items = [line('l1', 'adobo', 40)]
    const commands = await commandsFor(items)

    expect(commands.canIncreaseItem(items[0])).toBe(true)
    expect(commands.stockHintFor(items[0])).toBeNull()
  })

  it('reads no stock for a store without inventory', async () => {
    mockCeilings = new Map([['tapsi', 0]])
    const items = [line('l1', 'tapsi', 1)]
    const commands = await commandsFor(items, false)

    expect(commands.canIncreaseItem(items[0])).toBe(true)
    expect(ceilingReads.every(([tenantId]) => tenantId === null)).toBe(true)
  })
})
