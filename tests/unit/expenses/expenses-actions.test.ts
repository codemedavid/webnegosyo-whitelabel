export {}

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EXPENSE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CATEGORY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REQUEST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const mockVerify = jest.fn()
const mockTenant = jest.fn()
const mockRevalidate = jest.fn()
const mockRecord = jest.fn()
const mockVoid = jest.fn()
const mockReplace = jest.fn()
const mockSaveCategory = jest.fn()
const db = { kind: 'session-client' }

jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => mockRevalidate(...args) }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: (...args: unknown[]) => mockVerify(...args) }))
jest.mock('@/lib/cache', () => ({ getCachedTenantBySlug: (...args: unknown[]) => mockTenant(...args) }))
jest.mock('@/lib/supabase/server', () => ({ createClient: async () => db }))
jest.mock('@/lib/expenses/actor', () => ({ resolveExpenseActor: async () => ({ displayName: 'Ana' }) }))
jest.mock('@/lib/expenses/expense-service', () => ({
  recordExpense: (...args: unknown[]) => mockRecord(...args),
  voidExpense: (...args: unknown[]) => mockVoid(...args),
  replaceExpense: (...args: unknown[]) => mockReplace(...args),
  saveCategory: (...args: unknown[]) => mockSaveCategory(...args),
  updateExpenseDetails: jest.fn(),
  sortDrawerPayout: jest.fn(),
  archiveCategory: jest.fn(),
  saveSupplier: jest.fn(),
}))

async function load() {
  return import('@/app/actions/expenses')
}

const draft = {
  amountCents: 125_000,
  categoryId: CATEGORY,
  spentOn: '2026-10-21',
  paidFrom: 'cash',
  outletId: null,
  clientRequestId: REQUEST,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  jest.setSystemTime(Date.parse('2026-10-21T02:00:00Z'))
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockTenant.mockResolvedValue({ id: TENANT, slug: 'lolys-cafe' })
  mockVerify.mockResolvedValue({ user: { id: 'owner-1', email: 'o@x.ph' }, userRole: { role: 'admin', is_owner: true } })
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('recordExpenseAction', () => {
  it('checks the expenses key on the slug’s store, writes as the caller and refreshes the book', async () => {
    const { recordExpenseAction } = await load()
    mockRecord.mockResolvedValue({ id: EXPENSE })

    const result = await recordExpenseAction('lolys-cafe', { ...draft, note: '  ' })

    expect(result).toEqual({ ok: true, data: { id: EXPENSE } })
    expect(mockVerify).toHaveBeenCalledWith(TENANT, 'expenses')
    expect(mockRecord).toHaveBeenCalledWith(db, TENANT, expect.objectContaining({ amountCents: 125_000, note: null }), { displayName: 'Ana' })
    expect(mockRevalidate).toHaveBeenCalledWith('/lolys-cafe/admin/expenses')
  })

  it('refuses a malformed draft before touching the store', async () => {
    const { recordExpenseAction } = await load()
    const result = await recordExpenseAction('lolys-cafe', { ...draft, amountCents: 0 })
    expect(result).toEqual({ ok: false, error: 'Enter an amount above zero.' })
    expect(mockVerify).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('refuses a caller without the expenses key', async () => {
    const { recordExpenseAction } = await load()
    mockVerify.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    expect(await recordExpenseAction('lolys-cafe', draft)).toEqual({ ok: false, error: "You don't have access to expenses." })
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('refuses an unknown store', async () => {
    const { recordExpenseAction } = await load()
    mockTenant.mockResolvedValue(null)
    expect(await recordExpenseAction('nobody', draft)).toEqual({ ok: false, error: 'This store could not be found.' })
  })

  it('passes the service’s sentence through and does not refresh on failure', async () => {
    const { recordExpenseAction } = await load()
    mockRecord.mockRejectedValue(new Error('Add a note for this category.'))
    expect(await recordExpenseAction('lolys-cafe', draft)).toEqual({ ok: false, error: 'Add a note for this category.' })
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})

describe('the other actions', () => {
  it('voids with a trimmed reason', async () => {
    const { voidExpenseAction } = await load()
    expect(await voidExpenseAction('lolys-cafe', { expenseId: EXPENSE, reason: ' wrong category ' })).toEqual({ ok: true, data: null })
    expect(mockVoid).toHaveBeenCalledWith(db, { expenseId: EXPENSE, reason: 'wrong category' }, { displayName: 'Ana' })
  })

  it('replaces and answers the new id', async () => {
    const { replaceExpenseAction } = await load()
    mockReplace.mockResolvedValue('new-id')
    expect(await replaceExpenseAction('lolys-cafe', { expenseId: EXPENSE, reason: 'typo', patch: { amountCents: 99_00 } })).toEqual({
      ok: true,
      data: { id: 'new-id' },
    })
  })

  it('saves a category for the resolved store only', async () => {
    const { saveCategoryAction } = await load()
    mockSaveCategory.mockResolvedValue({ id: 'c1', name: 'Yelo' })
    await saveCategoryAction('lolys-cafe', { name: 'Yelo', group: 'ingredients' })
    expect(mockSaveCategory).toHaveBeenCalledWith(db, TENANT, { name: 'Yelo', group: 'ingredients' })
  })
})
