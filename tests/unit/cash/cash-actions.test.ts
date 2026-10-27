/**
 * Cash & remits server actions: validate first, check the key on the store
 * named by the slug (`cash_manage`; `settings` for the cutoff), write through
 * the caller's session, refresh the page only on success, never leak raw
 * database text.
 */
export {}

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PERIOD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const mockVerify = jest.fn()
const mockTenant = jest.fn()
const mockRevalidate = jest.fn()
const mockRpc = jest.fn()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockArchive = jest.fn()
const mockList = jest.fn()
const db = { kind: 'session-client', rpc: (...args: unknown[]) => mockRpc(...args) }

jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => mockRevalidate(...args) }))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: (...args: unknown[]) => mockVerify(...args) }))
jest.mock('@/lib/cache', () => ({ getCachedTenantBySlug: (...args: unknown[]) => mockTenant(...args) }))
jest.mock('@/lib/supabase/server', () => ({ createClient: async () => db }))
jest.mock('@/lib/cash/service-periods', () => {
  const actual = jest.requireActual('@/lib/cash/service-periods')
  return {
    ...actual,
    createServicePeriod: (...args: unknown[]) => mockCreate(...args),
    updateServicePeriod: (...args: unknown[]) => mockUpdate(...args),
    archiveServicePeriod: (...args: unknown[]) => mockArchive(...args),
    listServicePeriods: (...args: unknown[]) => mockList(...args),
  }
})

async function load() {
  return import('@/app/actions/cash')
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockTenant.mockResolvedValue({ id: TENANT, slug: 'lolys-cafe' })
  mockVerify.mockResolvedValue({ user: { id: 'owner-1' }, userRole: { role: 'admin', is_owner: true } })
})
afterEach(() => {
  jest.restoreAllMocks()
})

describe('saveCashSettingsAction', () => {
  it('checks cash_manage on the store, saves through the session and refreshes the page', async () => {
    const { saveCashSettingsAction } = await load()
    mockRpc.mockResolvedValue({ data: { blindClose: true }, error: null })

    const result = await saveCashSettingsAction('lolys-cafe', { blindClose: true })

    expect(mockVerify).toHaveBeenCalledWith(TENANT, 'cash_manage')
    expect(mockRpc).toHaveBeenCalledWith('save_cash_settings', { p_tenant: TENANT, p_settings: { blind_close: true } })
    expect(result.ok && result.data.blindClose).toBe(true)
    expect(mockRevalidate).toHaveBeenCalledWith('/lolys-cafe/admin/cash')
  })

  it('refuses staff without cash_manage before writing anything', async () => {
    const { saveCashSettingsAction } = await load()
    mockVerify.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))

    const result = await saveCashSettingsAction('lolys-cafe', { blindClose: true })

    expect(result.ok).toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it('refuses unknown keys and a bad slug without checking access', async () => {
    const { saveCashSettingsAction } = await load()

    expect((await saveCashSettingsAction('lolys-cafe', { tenantId: TENANT })).ok).toBe(false)
    expect((await saveCashSettingsAction('../x', { blindClose: true })).ok).toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('setBusinessDayCutoffAction', () => {
  it('needs settings (not cash_manage) and returns the first day it applies to', async () => {
    const { setBusinessDayCutoffAction } = await load()
    mockRpc.mockResolvedValue({ data: '2026-10-25', error: null })

    const result = await setBusinessDayCutoffAction('lolys-cafe', { cutoffMinutes: 240 })

    expect(mockVerify).toHaveBeenCalledWith(TENANT, 'settings')
    expect(result).toEqual({ ok: true, data: { effectiveFrom: '2026-10-25' } })
  })

  it('passes the database refusal on as a sentence, not Postgres text, and does not refresh', async () => {
    const { setBusinessDayCutoffAction } = await load()
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })

    const result = await setBusinessDayCutoffAction('lolys-cafe', { cutoffMinutes: 240 })

    expect(result.ok === false && result.error).not.toMatch(/permission denied/)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})

describe('saveServicePeriodAction', () => {
  const period = { name: 'Day shift', startsMinutes: 720, endsMinutes: 1200, outletId: null }

  it('adds a new shift at the end of the list', async () => {
    const { saveServicePeriodAction } = await load()
    mockList.mockResolvedValue([{ sort: 0 }, { sort: 3 }])
    mockCreate.mockResolvedValue({ id: PERIOD, ...period, sort: 4, archivedAt: null })

    const result = await saveServicePeriodAction('lolys-cafe', { id: null, ...period })

    expect(mockCreate).toHaveBeenCalledWith(db, TENANT, period, 4)
    expect(result.ok).toBe(true)
  })

  it('changes an existing shift', async () => {
    const { saveServicePeriodAction } = await load()
    mockUpdate.mockResolvedValue({ id: PERIOD, ...period, sort: 0, archivedAt: null })

    await saveServicePeriodAction('lolys-cafe', { id: PERIOD, ...period })

    expect(mockUpdate).toHaveBeenCalledWith(db, TENANT, PERIOD, period)
  })

  it('shows the service’s own sentence when a write is refused, and a generic one otherwise', async () => {
    const { saveServicePeriodAction } = await load()
    const { SERVICE_PERIOD_NOT_SAVED } = await import('@/lib/cash/service-periods')
    mockUpdate.mockRejectedValueOnce(new Error(SERVICE_PERIOD_NOT_SAVED))
    mockUpdate.mockRejectedValueOnce(new Error('relation "service_periods" does not exist'))

    const refused = await saveServicePeriodAction('lolys-cafe', { id: PERIOD, ...period })
    const broken = await saveServicePeriodAction('lolys-cafe', { id: PERIOD, ...period })

    expect(refused).toEqual({ ok: false, error: SERVICE_PERIOD_NOT_SAVED })
    expect(broken.ok === false && broken.error).not.toMatch(/relation/)
  })
})

describe('archiveServicePeriodAction', () => {
  it('archives by id', async () => {
    const { archiveServicePeriodAction } = await load()
    mockArchive.mockResolvedValue(undefined)

    expect(await archiveServicePeriodAction('lolys-cafe', { id: PERIOD })).toEqual({ ok: true, data: null })
    expect(mockArchive).toHaveBeenCalledWith(db, TENANT, PERIOD)
  })
})
