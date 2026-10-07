/**
 * `createOrder` (platform backend) guards its INSERT with four tenant-scoped
 * reads — store hours, the dishes, the order type and the payment method —
 * and then read the order type AGAIN for its name. None needs another's
 * answer, so they leave together, and the type's name comes from the same
 * tenant-scoped row the IDOR check reads.
 */

import { describe, test, expect } from '@jest/globals'
import { loadOrderWriteChecks } from '@/lib/checkout/order-write-checks'

interface Pending {
  table: string
  columns: string
  filters: Array<[string, unknown]>
  resolve: (value: { data: unknown; error: unknown }) => void
}

function deferredClient() {
  const pending: Pending[] = []
  const client = {
    from: (table: string) => {
      let resolveRead: Pending['resolve'] = () => {}
      const promise = new Promise<{ data: unknown; error: unknown }>((resolve) => { resolveRead = resolve })
      const entry: Pending = { table, columns: '', filters: [], resolve: (value) => resolveRead(value) }
      pending.push(entry)
      const chain: Record<string, unknown> = {
        select: (columns: string) => { entry.columns = columns; return chain },
        eq: (column: string, value: unknown) => { entry.filters.push([column, value]); return chain },
        in: (column: string, value: unknown) => { entry.filters.push([column, value]); return chain },
        maybeSingle: () => promise,
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          promise.then(onFulfilled, onRejected),
      }
      return chain
    },
  }
  return { client, pending }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function settleAll(pending: Pending[], answers: Record<string, { data: unknown; error: unknown }>) {
  for (const read of pending) read.resolve(answers[read.table] ?? { data: null, error: null })
}

describe('loadOrderWriteChecks', () => {
  test('issues all four guard reads before any answers', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checks = loadOrderWriteChecks(client as any, {
      tenantId: 't1', menuItemIds: ['mi-1'], orderTypeId: 'ot-1', paymentMethodId: 'pm-1',
    })
    await flush()

    // Assert
    expect(pending.map((read) => read.table).sort()).toEqual(['menu_items', 'order_types', 'payment_methods', 'tenants'])
    for (const read of pending) {
      const tenantFilter = read.table === 'tenants' ? ['id', 't1'] : ['tenant_id', 't1']
      expect(read.filters).toContainEqual(tenantFilter)
    }
    settleAll(pending, {
      tenants: { data: { operating_hours: null }, error: null },
      menu_items: { data: [{ id: 'mi-1', name: 'Latte' }], error: null },
      order_types: { data: { id: 'ot-1', name: 'Pickup' }, error: null },
      payment_methods: { data: { id: 'pm-1' }, error: null },
    })
    await expect(checks).resolves.toEqual({
      hoursRow: { operating_hours: null },
      menuItems: { data: [{ id: 'mi-1', name: 'Latte' }], error: null },
      orderType: { data: { id: 'ot-1', name: 'Pickup' }, error: null },
      paymentMethod: { data: { id: 'pm-1' }, error: null },
    })
  })

  test('reads the order type name in the same tenant-scoped IDOR read', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void loadOrderWriteChecks(client as any, { tenantId: 't1', menuItemIds: ['mi-1'], orderTypeId: 'ot-1' })
    await flush()

    // Assert
    const orderTypeRead = pending.find((read) => read.table === 'order_types')!
    expect(orderTypeRead.columns).toBe('id, name')
    expect(orderTypeRead.filters).toEqual([['id', 'ot-1'], ['tenant_id', 't1']])
  })

  test('skips the order-type and payment reads when neither was chosen', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checks = loadOrderWriteChecks(client as any, { tenantId: 't1', menuItemIds: ['mi-1'] })
    await flush()
    settleAll(pending, {})

    // Assert
    expect(pending.map((read) => read.table).sort()).toEqual(['menu_items', 'tenants'])
    await expect(checks).resolves.toMatchObject({ orderType: null, paymentMethod: null })
  })
})
