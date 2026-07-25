import { describe, it, expect } from '@jest/globals'
import {
  buildTenantOrderRow,
  buildTenantOrderItemRows,
  createOrderTenantSupabase,
  type TenantOrderInput,
  type TenantOrderTokenPair,
} from '@/lib/tenant-supabase-orders'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const ORDER_ID = '22222222-2222-2222-2222-222222222222'

const FIXED_TOKEN: TenantOrderTokenPair = {
  token: 'plaintext-token',
  tokenHash: 'hashed-token',
  expiresAt: '2026-07-25T12:15:00.000Z',
}

function makeInput(overrides: Partial<TenantOrderInput> = {}): TenantOrderInput {
  return {
    tenantId: TENANT_ID,
    items: [
      {
        menu_item_id: 'aaaa1111-1111-1111-1111-111111111111',
        menu_item_name: 'Latte',
        addons: [],
        quantity: 2,
        price: 100,
        subtotal: 200,
      },
    ],
    customerInfo: { name: 'Ana', contact: '+639170000000' },
    ...overrides,
  }
}

// ── Pure row builders ────────────────────────────────────────────────────────

describe('buildTenantOrderRow', () => {
  it('totals item subtotals plus delivery fee and service charge', () => {
    // Arrange
    const input = makeInput({ deliveryFee: 50, serviceChargeAmount: 20 })

    // Act
    const row = buildTenantOrderRow(input, FIXED_TOKEN)

    // Assert
    expect(row.total).toBe(270)
  })

  it('treats a missing delivery fee and service charge as zero', () => {
    const row = buildTenantOrderRow(makeInput(), FIXED_TOKEN)

    expect(row.total).toBe(200)
    expect(row.delivery_fee).toBe(0)
    expect(row.service_charge_amount).toBe(0)
  })

  it('scopes the row to the tenant', () => {
    const row = buildTenantOrderRow(makeInput(), FIXED_TOKEN)

    expect(row.tenant_id).toBe(TENANT_ID)
  })

  it('starts the order pending on both status axes', () => {
    const row = buildTenantOrderRow(makeInput(), FIXED_TOKEN)

    expect(row.status).toBe('pending')
    expect(row.payment_status).toBe('pending')
  })

  it('stores payment proof in real columns rather than smuggling it in customer_data', () => {
    // Arrange: unlike Convex, the tenant bundle HAS payment_proof_* columns.
    const input = makeInput({
      paymentProof: { url: 'https://ik.io/proof.png', publicId: 'file_1', reference: 'REF-9' },
    })

    // Act
    const row = buildTenantOrderRow(input, FIXED_TOKEN)

    // Assert
    expect(row.payment_proof_url).toBe('https://ik.io/proof.png')
    expect(row.payment_proof_public_id).toBe('file_1')
    expect(row.payment_proof_reference).toBe('REF-9')
    expect(JSON.stringify(row.customer_data)).not.toContain('proof.png')
  })

  it('timestamps the proof upload only when a proof was actually supplied', () => {
    const withProof = buildTenantOrderRow(
      makeInput({ paymentProof: { reference: 'REF-9' } }),
      FIXED_TOKEN
    )
    const withoutProof = buildTenantOrderRow(makeInput(), FIXED_TOKEN)

    expect(withProof.payment_proof_uploaded_at).toEqual(expect.any(String))
    expect(withoutProof.payment_proof_uploaded_at).toBeNull()
  })

  it('carries an advance-order schedule as a real column', () => {
    // Convex has to smuggle this through customerData; the tenant bundle does not.
    const row = buildTenantOrderRow(
      makeInput({ scheduledForISO: '2026-07-26T02:00:00.000Z' }),
      FIXED_TOKEN
    )

    expect(row.scheduled_for).toBe('2026-07-26T02:00:00.000Z')
  })

  it('leaves scheduled_for null for an ASAP order', () => {
    const row = buildTenantOrderRow(makeInput(), FIXED_TOKEN)

    expect(row.scheduled_for).toBeNull()
  })

  it('embeds the token hash and expiry so the token is stored atomically at insert', () => {
    // The platform path writes the order, then UPDATEs the token in. Doing it in
    // the insert removes a round trip and a window where the order has no token.
    const row = buildTenantOrderRow(makeInput(), FIXED_TOKEN)

    expect(row.order_token_hash).toBe(FIXED_TOKEN.tokenHash)
    expect(row.order_token_expires_at).toBe(FIXED_TOKEN.expiresAt)
  })

  it('never writes the plaintext token to the database', () => {
    const row = buildTenantOrderRow(makeInput(), FIXED_TOKEN)

    expect(JSON.stringify(row)).not.toContain(FIXED_TOKEN.token)
  })
})

describe('buildTenantOrderItemRows', () => {
  it('attaches every line to the created order', () => {
    const rows = buildTenantOrderItemRows(ORDER_ID, makeInput().items)

    expect(rows).toHaveLength(1)
    expect(rows[0].order_id).toBe(ORDER_ID)
    expect(rows[0].menu_item_name).toBe('Latte')
  })

  it('defaults missing addons to an empty array the column can accept', () => {
    const rows = buildTenantOrderItemRows(ORDER_ID, [
      { menu_item_id: 'x', menu_item_name: 'Tea', quantity: 1, price: 10, subtotal: 10 },
    ])

    expect(rows[0].addons).toEqual([])
  })

  it('flattens object addons to names so the text[] column stays valid', () => {
    const rows = buildTenantOrderItemRows(ORDER_ID, [
      {
        menu_item_id: 'x',
        menu_item_name: 'Tea',
        quantity: 1,
        price: 10,
        subtotal: 10,
        addons: [{ name: 'Boba', price: 20 }],
      },
    ])

    expect(rows[0].addons).toEqual(['Boba'])
  })
})

// ── Writer against an injected tenant client ─────────────────────────────────

interface FakeClientOptions {
  orderError?: { message: string } | null
  itemsError?: { message: string } | null
}

function makeFakeClient(options: FakeClientOptions = {}) {
  const calls = {
    tables: [] as string[],
    orderRow: null as Record<string, unknown> | null,
    itemRows: null as Array<Record<string, unknown>> | null,
    deletedOrderIds: [] as string[],
  }

  const client = {
    from(table: string) {
      calls.tables.push(table)
      return {
        insert(rows: unknown) {
          if (table === 'orders') {
            calls.orderRow = rows as Record<string, unknown>
            return {
              select: () => ({
                single: async () =>
                  options.orderError
                    ? { data: null, error: options.orderError }
                    : { data: { id: ORDER_ID, ...(rows as object) }, error: null },
              }),
            }
          }
          calls.itemRows = rows as Array<Record<string, unknown>>
          return Promise.resolve({ error: options.itemsError ?? null })
        },
        delete() {
          return {
            eq: async (_column: string, value: string) => {
              calls.deletedOrderIds.push(value)
              return { error: null }
            },
          }
        },
      }
    },
  }

  return { client, calls }
}

const deps = { generateToken: () => FIXED_TOKEN }

describe('createOrderTenantSupabase', () => {
  it('writes the order and its items to the tenant project', async () => {
    // Arrange
    const { client, calls } = makeFakeClient()

    // Act
    await createOrderTenantSupabase(client as never, makeInput(), deps)

    // Assert
    expect(calls.tables).toContain('orders')
    expect(calls.tables).toContain('order_items')
    expect(calls.orderRow?.tenant_id).toBe(TENANT_ID)
    expect(calls.itemRows).toHaveLength(1)
    expect(calls.itemRows?.[0].order_id).toBe(ORDER_ID)
  })

  it('returns the created order and the plaintext token for the caller', async () => {
    const { client } = makeFakeClient()

    const result = await createOrderTenantSupabase(client as never, makeInput(), deps)

    expect(result.order.id).toBe(ORDER_ID)
    expect(result.orderToken).toBe(FIXED_TOKEN.token)
  })

  it('fails loudly when the order insert is rejected', async () => {
    const { client } = makeFakeClient({ orderError: { message: 'permission denied' } })

    await expect(
      createOrderTenantSupabase(client as never, makeInput(), deps)
    ).rejects.toThrow(/permission denied/)
  })

  it('does not attempt to write items when the order insert failed', async () => {
    const { client, calls } = makeFakeClient({ orderError: { message: 'nope' } })

    await expect(
      createOrderTenantSupabase(client as never, makeInput(), deps)
    ).rejects.toThrow()
    expect(calls.tables).not.toContain('order_items')
  })

  it('rolls the order back when its items cannot be written', async () => {
    // Arrange: a headerless order would show in the merchant queue with no lines.
    const { client, calls } = makeFakeClient({ itemsError: { message: 'constraint violation' } })

    // Act / Assert
    await expect(
      createOrderTenantSupabase(client as never, makeInput(), deps)
    ).rejects.toThrow(/constraint violation/)
    expect(calls.deletedOrderIds).toEqual([ORDER_ID])
  })

  it('rejects an empty order before touching the database', async () => {
    const { client, calls } = makeFakeClient()

    await expect(
      createOrderTenantSupabase(client as never, makeInput({ items: [] }), deps)
    ).rejects.toThrow(/at least one item/i)
    expect(calls.tables).toHaveLength(0)
  })
})
