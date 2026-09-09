/**
 * `orderTypeSchema` after the kinds/availability/pricing widening.
 *
 * The schema is the write boundary for every admin save, so it has to accept
 * the aggregator kinds, hold the markup to the DB CHECK range, and refuse a
 * row hidden from both channels — the same CHECK the DB enforces, but with a
 * message a merchant can act on instead of a constraint name.
 */

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: jest.fn() }))

async function loadSchema() {
  const mod = await import('@/lib/order-types-service')
  return mod.orderTypeSchema
}

const base = {
  name: 'Grab',
  is_enabled: true,
  order_index: 0,
}

describe('orderTypeSchema — kinds', () => {
  it.each(['dine_in', 'pickup', 'delivery', 'grab', 'foodpanda', 'other'])(
    'accepts the %s kind',
    async (type) => {
      const schema = await loadSchema()
      expect(schema.safeParse({ ...base, type }).success).toBe(true)
    }
  )

  it('refuses an unknown kind', async () => {
    const schema = await loadSchema()
    expect(schema.safeParse({ ...base, type: 'drone' }).success).toBe(false)
  })
})

describe('orderTypeSchema — availability', () => {
  it('accepts a row that names no channel (DB defaults both on)', async () => {
    const schema = await loadSchema()
    expect(schema.safeParse({ ...base, type: 'grab' }).success).toBe(true)
  })

  it('accepts one channel off when the other is on', async () => {
    const schema = await loadSchema()
    expect(
      schema.safeParse({ ...base, type: 'grab', available_on_web: false, available_on_pos: true })
        .success
    ).toBe(true)
  })

  it('accepts one channel off when the other is left unspecified', async () => {
    const schema = await loadSchema()
    expect(schema.safeParse({ ...base, type: 'grab', available_on_web: false }).success).toBe(true)
  })

  it('refuses both channels off, pointing at available_on_pos', async () => {
    const schema = await loadSchema()
    const result = schema.safeParse({
      ...base,
      type: 'grab',
      available_on_web: false,
      available_on_pos: false,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    const issue = result.error.issues.find((i) => i.path.join('.') === 'available_on_pos')
    expect(issue?.message).toMatch(/at least one/i)
  })
})

describe('orderTypeSchema — POS markup', () => {
  it('accepts null (store price)', async () => {
    const schema = await loadSchema()
    expect(schema.safeParse({ ...base, type: 'grab', pos_markup_percent: null }).success).toBe(true)
  })

  it('accepts the range edges -100 and 500', async () => {
    const schema = await loadSchema()
    expect(schema.safeParse({ ...base, type: 'grab', pos_markup_percent: -100 }).success).toBe(true)
    expect(schema.safeParse({ ...base, type: 'grab', pos_markup_percent: 500 }).success).toBe(true)
  })

  it('refuses a markup outside -100..500', async () => {
    const schema = await loadSchema()
    expect(schema.safeParse({ ...base, type: 'grab', pos_markup_percent: -101 }).success).toBe(false)
    expect(schema.safeParse({ ...base, type: 'grab', pos_markup_percent: 501 }).success).toBe(false)
  })
})
