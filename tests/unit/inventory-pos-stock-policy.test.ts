/**
 * tenants.pos_stock_policy (20261104150000): what the register does when a sale
 * asks for more than the shelf holds. 'warn' (default, today's behaviour) or
 * 'block' (selling past the stock needs a manager PIN).
 *
 * A failed or impossible read is ALWAYS 'warn': a store whose policy cannot be
 * read must never have its register stopped by it (a failed stock read never
 * blocks a sale), and the column does not exist until the migration is applied.
 */

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'

function answer(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = jest.fn(() => chain)
  chain.eq = jest.fn(() => chain)
  chain.maybeSingle = jest.fn(() => Promise.resolve(result))
  return chain
}

async function load() {
  return import('@/lib/inventory/pos-stock-policy')
}

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('toPosStockPolicy', () => {
  it('keeps the two known policies', async () => {
    const { toPosStockPolicy } = await load()
    expect(toPosStockPolicy('warn')).toBe('warn')
    expect(toPosStockPolicy('block')).toBe('block')
  })

  it('reads anything else as warn, the default', async () => {
    const { toPosStockPolicy, DEFAULT_POS_STOCK_POLICY } = await load()
    expect(DEFAULT_POS_STOCK_POLICY).toBe('warn')
    for (const value of [undefined, null, '', 'BLOCK', 'ignore', 1, {}]) {
      expect(toPosStockPolicy(value)).toBe('warn')
    }
  })
})

describe('canChangePosStockPolicy (mirrors guard_tenant_pos_stock_policy)', () => {
  it('lets the store-wide owner of this store change it', async () => {
    const { canChangePosStockPolicy } = await load()
    expect(canChangePosStockPolicy({ role: 'admin', tenant_id: TENANT, is_owner: true, outlet_id: null }, TENANT)).toBe(true)
  })

  it('lets a superadmin change it', async () => {
    const { canChangePosStockPolicy } = await load()
    expect(canChangePosStockPolicy({ role: 'superadmin', tenant_id: null, is_owner: false, outlet_id: null }, TENANT)).toBe(true)
  })

  it('refuses staff, a branch-locked owner, another store and nobody', async () => {
    const { canChangePosStockPolicy } = await load()
    expect(canChangePosStockPolicy({ role: 'admin', tenant_id: TENANT, is_owner: false, outlet_id: null }, TENANT)).toBe(false)
    expect(canChangePosStockPolicy({ role: 'admin', tenant_id: TENANT, is_owner: true, outlet_id: 'branch-1' }, TENANT)).toBe(false)
    expect(canChangePosStockPolicy({ role: 'admin', tenant_id: 'other', is_owner: true, outlet_id: null }, TENANT)).toBe(false)
    expect(canChangePosStockPolicy(null, TENANT)).toBe(false)
  })
})

describe('readPosStockPolicy', () => {
  it('answers the stored policy', async () => {
    const chain = answer({ data: { pos_stock_policy: 'block' }, error: null })
    from.mockReturnValue(chain)
    const { readPosStockPolicy } = await load()

    await expect(readPosStockPolicy(TENANT)).resolves.toBe('block')
    expect(from).toHaveBeenCalledWith('tenants')
    expect(chain.select).toHaveBeenCalledWith('pos_stock_policy')
    expect(chain.eq).toHaveBeenCalledWith('id', TENANT)
  })

  it('answers warn when the column is missing (migration not applied yet)', async () => {
    from.mockReturnValue(answer({ data: null, error: { code: '42703', message: 'column tenants.pos_stock_policy does not exist' } }))
    const { readPosStockPolicy } = await load()

    await expect(readPosStockPolicy(TENANT)).resolves.toBe('warn')
  })

  it('answers warn when the read throws or finds no store', async () => {
    from.mockImplementationOnce(() => { throw new Error('fetch failed') })
    const { readPosStockPolicy } = await load()
    await expect(readPosStockPolicy(TENANT)).resolves.toBe('warn')

    from.mockReturnValue(answer({ data: null, error: null }))
    await expect(readPosStockPolicy(TENANT)).resolves.toBe('warn')
  })
})
