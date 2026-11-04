/**
 * The owner's switch for the register stock rule (Inventory → "When stock runs
 * short at the register"). The database guard (20261104150000) is the
 * boundary; the action pre-checks so a staff account gets a plain sentence,
 * writes through the CALLER's session and counts the affected rows, because an
 * RLS refusal comes back as zero rows, not an error.
 */

const verifyTenantAdmin = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: (...a: unknown[]) => verifyTenantAdmin(...a),
}))

const revalidatePath = jest.fn()
jest.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

const update = jest.fn()
const eq = jest.fn()
let writeAnswer: { data: unknown; error: unknown } = { data: [{ id: 't1' }], error: null }
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      update: (patch: unknown) => {
        update(patch)
        return {
          eq: (...a: unknown[]) => {
            eq(...a)
            return { select: () => Promise.resolve(writeAnswer) }
          },
        }
      },
    }),
  }),
}))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const OWNER = { userRole: { role: 'admin', tenant_id: TENANT, is_owner: true, outlet_id: null } }
const STAFF = { userRole: { role: 'admin', tenant_id: TENANT, is_owner: false, outlet_id: null, permissions: ['settings'] } }

async function load() {
  return import('@/app/actions/pos-stock-policy')
}

beforeEach(() => {
  jest.clearAllMocks()
  writeAnswer = { data: [{ id: TENANT }], error: null }
  verifyTenantAdmin.mockResolvedValue(OWNER)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('setPosStockPolicyAction', () => {
  it('lets the owner switch to "ask for a manager PIN"', async () => {
    const { setPosStockPolicyAction } = await load()

    const result = await setPosStockPolicyAction(TENANT, 'lolys', 'block')

    expect(result).toEqual({ success: true, policy: 'block' })
    expect(update).toHaveBeenCalledWith({ pos_stock_policy: 'block' })
    expect(eq).toHaveBeenCalledWith('id', TENANT)
    expect(revalidatePath).toHaveBeenCalledWith('/lolys/admin/inventory')
  })

  it('refuses staff before writing anything', async () => {
    verifyTenantAdmin.mockResolvedValue(STAFF)
    const { setPosStockPolicyAction } = await load()

    const result = await setPosStockPolicyAction(TENANT, 'lolys', 'warn')

    expect(result).toEqual({ success: false, error: 'Only the store owner can change this.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses an unknown policy before writing anything', async () => {
    const { setPosStockPolicyAction } = await load()

    const result = await setPosStockPolicyAction(TENANT, 'lolys', 'ignore' as never)

    expect(result.success).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('reports a silent refusal (zero rows) instead of claiming it saved', async () => {
    writeAnswer = { data: [], error: null }
    const { setPosStockPolicyAction } = await load()

    const result = await setPosStockPolicyAction(TENANT, 'lolys', 'block')

    expect(result).toEqual({ success: false, error: 'This setting could not be saved. Please try again.' })
  })

  it('reports a database refusal with the same plain sentence', async () => {
    writeAnswer = { data: null, error: { code: '42501', message: 'Only the store owner can change tenants.pos_stock_policy' } }
    const { setPosStockPolicyAction } = await load()

    const result = await setPosStockPolicyAction(TENANT, 'lolys', 'block')

    expect(result).toEqual({ success: false, error: 'This setting could not be saved. Please try again.' })
  })

  it('refuses a caller who is not an admin of this store', async () => {
    verifyTenantAdmin.mockRejectedValue(new Error('Unauthorized: Not admin of this tenant'))
    const { setPosStockPolicyAction } = await load()

    const result = await setPosStockPolicyAction(TENANT, 'lolys', 'block')

    expect(result).toEqual({ success: false, error: 'Unauthorized: Not admin of this tenant' })
    expect(update).not.toHaveBeenCalled()
  })
})

export {}
