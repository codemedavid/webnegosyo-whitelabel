/**
 * One order edit moves stock exactly once — without blocking the next edit.
 *
 * The claim is keyed on (tenant, order, direction), which is exactly right
 * while an order's stock moves at most twice: sold, then perhaps voided. Order
 * editing breaks that assumption. Every saved revision may spend more
 * ingredients or return some, and each of those is a `sale` or a `void` on an
 * order that already has one.
 *
 * Keying the claim on the revision too keeps both properties: a revision still
 * cannot apply twice (a retried save is a no-op), but revision 2 is free to
 * move stock after revision 1 did.
 *
 * The revision number is the natural key here — it is minted by the optimistic
 * lock, is monotonic per order, and a client cannot reuse one without its save
 * being refused outright.
 */

import { claimOrderStockApplication } from '@/lib/inventory/order-stock-claim'

const TENANT = '44444444-4444-4444-8444-444444444444'
const ORDER = 'ord-1'

/** Records what was inserted so the claim's shape can be asserted. */
function buildClient(outcome: { error?: { code?: string } } = {}) {
  const inserted: Record<string, unknown>[] = []

  const from = () => ({
    insert: (value: Record<string, unknown>) => {
      inserted.push(value)
      return Promise.resolve({ data: null, error: outcome.error ?? null })
    },
  })

  return { client: { from } as never, inserted }
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('claimOrderStockApplication with a revision', () => {
  it('records the revision the claim belongs to', async () => {
    const { client, inserted } = buildClient()

    await claimOrderStockApplication(client, TENANT, ORDER, 'sale', 2)

    expect(inserted[0]).toMatchObject({
      tenant_id: TENANT,
      order_id: ORDER,
      reason: 'sale',
      revision: 2,
    });
  })

  /**
   * The original sale. Every claim written before editing existed is revision
   * 0, and the migration backfills that default, so an un-edited order keeps
   * behaving exactly as it did.
   */
  it('treats an unrevised claim as revision zero', async () => {
    const { client, inserted } = buildClient()

    await claimOrderStockApplication(client, TENANT, ORDER, 'sale')

    expect(inserted[0]).toMatchObject({ revision: 0 })
  })

  it('still refuses a duplicate claim for the same revision', async () => {
    // A retried save must not spend the ingredients a second time.
    const { client } = buildClient({ error: { code: '23505' } })

    expect(await claimOrderStockApplication(client, TENANT, ORDER, 'sale', 2)).toBe(false)
  })

  it('still throws on a database error that is not a duplicate', async () => {
    // Reading an outage as "already applied" would silently skip a real
    // depletion — the exact failure the claim exists to prevent.
    const { client } = buildClient({ error: { code: '08006' } })

    await expect(
      claimOrderStockApplication(client, TENANT, ORDER, 'sale', 2),
    ).rejects.toBeDefined()
  })
})
