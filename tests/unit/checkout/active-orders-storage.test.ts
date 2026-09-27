import { rememberActiveOrder } from '@/lib/checkout/active-orders-storage'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    read: (key: string) => JSON.parse(data.get(key) ?? 'null'),
  }
}

const ENTRY = { orderId: 'order-1', trackingToken: 'tok', createdAt: '2026-09-25T00:00:00.000Z' }

describe('rememberActiveOrder', () => {
  it('adds the order to the tenant’s list', () => {
    const storage = memoryStorage()

    rememberActiveOrder(storage, 'acme', ENTRY)

    expect(storage.read('active_orders_acme')).toEqual([ENTRY])
  })

  it('never adds the same order twice', () => {
    const storage = memoryStorage({ active_orders_acme: JSON.stringify([ENTRY]) })

    rememberActiveOrder(storage, 'acme', ENTRY)

    expect(storage.read('active_orders_acme')).toHaveLength(1)
  })

  it('starts over from a corrupted (non-array) value instead of losing the new order', () => {
    const storage = memoryStorage({ active_orders_acme: '{"not":"a list"}' })

    rememberActiveOrder(storage, 'acme', ENTRY)

    expect(storage.read('active_orders_acme')).toEqual([ENTRY])
  })

  it('swallows a storage write failure', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }

    expect(() => rememberActiveOrder(storage, 'acme', ENTRY)).not.toThrow()
  })
})
