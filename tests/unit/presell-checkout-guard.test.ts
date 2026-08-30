/**
 * The authoritative presell decision `createOrderAction` calls.
 *
 * Direction of failure is the OPPOSITE of the ingredient guard. There, silence
 * is the default: a failed read must not close a shop that never promised
 * anything. Presell IS a promise — "only 20 on Dec 24" — so once the tenant has
 * the feature on, an unreadable shelf refuses rather than overselling a date.
 * The tenant flag itself stays fail-open: presell off (or unknowable) means the
 * store behaves exactly as it did before the feature existed.
 */

import { findPresellViolationMessage } from '@/lib/presell/checkout-guard'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

/** Chainable, thenable Supabase stub — mirrors inventory-checkout-stock-guard. */
function table(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve({ data, error }),
    maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error }),
    single: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error }),
  }
  for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte']) {
    chain[method] = () => chain
  }
  return chain
}

const BILAO = { id: 'm-bilao', name: 'Party Bilao', presell_enabled: true }
const COKE = { id: 'm-coke', name: 'Coke', presell_enabled: false }
const ALLOCATION = {
  menu_item_id: 'm-bilao', presell_date: '2026-12-24', stock_qty: 20, sold_qty: 15,
}

interface WireOptions {
  tenant?: unknown
  menuItems?: unknown[]
  allocations?: unknown[]
  tenantError?: unknown
  readError?: unknown
}

function wire(options: WireOptions = {}) {
  const tables: Record<string, unknown> = {
    tenants: table(options.tenant ?? { presell_enabled: true }, options.tenantError ?? null),
    menu_items: table(options.menuItems ?? [BILAO, COKE], options.readError ?? null),
    presell_stock: table(options.allocations ?? [ALLOCATION], options.readError ?? null),
  }
  from.mockImplementation((name: string) => tables[name] ?? table([]))
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('findPresellViolationMessage', () => {
  it('accepts a cart that fits the date allocation', async () => {
    wire()
    const message = await findPresellViolationMessage('t1', [
      { menuItemId: 'm-bilao', quantity: 5, presellDate: '2026-12-24' },
    ])
    expect(message).toBe('')
  })

  it('refuses a cart asking for more than the date has left, naming the dish', async () => {
    wire()
    const message = await findPresellViolationMessage('t1', [
      { menuItemId: 'm-bilao', quantity: 6, presellDate: '2026-12-24' },
    ])
    expect(message).toContain('Party Bilao')
    expect(message).toContain('5')
  })

  it('refuses a date with no allocation at all — zero, never unlimited', async () => {
    wire()
    const message = await findPresellViolationMessage('t1', [
      { menuItemId: 'm-bilao', quantity: 1, presellDate: '2026-12-26' },
    ])
    expect(message).toContain('Party Bilao')
  })

  it('refuses a presell item arriving without a date', async () => {
    wire()
    const message = await findPresellViolationMessage('t1', [
      { menuItemId: 'm-bilao', quantity: 1 },
    ])
    expect(message).toContain('Party Bilao')
    expect(message.toLowerCase()).toContain('date')
  })

  it('has no opinion on ordinary items', async () => {
    wire()
    const message = await findPresellViolationMessage('t1', [
      { menuItemId: 'm-coke', quantity: 4 },
    ])
    expect(message).toBe('')
  })

  it('has no opinion when the tenant flag is off, whatever the lines claim', async () => {
    wire({ tenant: { presell_enabled: false } })
    const message = await findPresellViolationMessage('t1', [
      { menuItemId: 'm-bilao', quantity: 50, presellDate: '2026-12-24' },
    ])
    expect(message).toBe('')
  })

  it('has no opinion when the tenant flag cannot be read — feature-off behavior', async () => {
    wire({ tenant: null, tenantError: { message: 'column does not exist' } })
    const message = await findPresellViolationMessage('t1', [
      { menuItemId: 'm-bilao', quantity: 1, presellDate: '2026-12-24' },
    ])
    expect(message).toBe('')
  })

  it('FAILS CLOSED when the feature is on but the shelf cannot be read', async () => {
    wire({ readError: { message: 'network down' } })
    const message = await findPresellViolationMessage('t1', [
      { menuItemId: 'm-bilao', quantity: 1, presellDate: '2026-12-24' },
    ])
    expect(message).not.toBe('')
  })

  it('returns quickly for an empty cart', async () => {
    wire()
    expect(await findPresellViolationMessage('t1', [])).toBe('')
    expect(from).not.toHaveBeenCalled()
  })

  it('judges merged quantities across lines of the same item and date', async () => {
    wire()
    const message = await findPresellViolationMessage('t1', [
      { menuItemId: 'm-bilao', quantity: 3, presellDate: '2026-12-24' },
      { menuItemId: 'm-bilao', quantity: 3, presellDate: '2026-12-24' },
    ])
    expect(message).toContain('Party Bilao')
  })
})
