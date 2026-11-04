import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// next/jest leaves static imports ahead of jest.mock, so the action is
// imported lazily inside each test (see tests/unit README notes).

const TENANT = '11111111-1111-4111-8111-111111111111'

const verifyTenantAdmin = jest.fn<(tenantId: string) => Promise<unknown>>()
const upsertSelect = jest.fn<() => Promise<{ data: unknown; error: unknown }>>()
const upsert = jest.fn<(row: unknown, options: unknown) => { select: typeof upsertSelect }>(() => ({
  select: upsertSelect,
}))
const from = jest.fn<(table: string) => { upsert: typeof upsert }>(() => ({ upsert }))
const revalidatePath = jest.fn()
const setOwnApprovalPin = jest.fn<(...args: unknown[]) => Promise<unknown>>()

jest.mock('@/lib/admin-service', () => ({ verifyTenantAdmin }))
jest.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))
jest.mock('next/cache', () => ({ revalidatePath }))
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}), ADMIN_QUERY_TIMEOUT_MS: 8000 }))
jest.mock('@/lib/gov-discount-ledger/supabase-approval-store', () => ({ createSupabaseApprovalStore: () => ({}) }))
jest.mock('@/lib/gov-discount-ledger/approval-service', () => ({ setOwnApprovalPin }))

const owner = { user: { id: 'owner-1' }, userRole: { role: 'admin', tenant_id: TENANT, is_owner: true } }
const cashier = {
  user: { id: 'staff-1' },
  userRole: { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['settings'] },
}

const values = {
  vatStatus: 'vat',
  registeredName: 'Sukad Food Corp.',
  tin: '123-456-789-00000',
  tinBranchCode: '',
  businessAddress: '',
  isBirRegisteredPos: false,
  posMin: '',
  posSerialNo: '',
  posPtuNo: '',
  enabledKinds: ['senior', 'pwd'],
  allowSharedTable: true,
  approvalRule: 'above',
  approvalThreshold: '500',
  serviceChargeMode: 'full',
  idPhotoMode: 'off',
  onlineClaimsEnabled: false,
}

const loadActions = () => import('@/app/actions/tax-settings')

beforeEach(() => {
  jest.clearAllMocks()
  // The action logs refused writes for Vercel; keep the test output clean.
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  verifyTenantAdmin.mockResolvedValue(owner)
  upsertSelect.mockResolvedValue({ data: [{ tenant_id: TENANT }], error: null })
})

describe('saveTaxSettingsAction', () => {
  it('upserts the owner’s profile through their own session and refreshes the page', async () => {
    const { saveTaxSettingsAction } = await loadActions()

    await expect(saveTaxSettingsAction(TENANT, 'sukad', values)).resolves.toEqual({ success: true })

    expect(from).toHaveBeenCalledWith('store_tax_profiles')
    const [row, options] = upsert.mock.calls[0]
    expect(options).toEqual({ onConflict: 'tenant_id' })
    expect(row).toMatchObject({
      tenant_id: TENANT,
      vat_status: 'vat',
      tin: '123-456-789',
      tin_branch_code: '00000',
      approval_threshold: 500,
      enabled_kinds: ['senior', 'pwd'],
    })
    expect(row).not.toHaveProperty('updated_by')
    expect(revalidatePath).toHaveBeenCalledWith('/sukad/admin/settings/tax')
  })

  it('reports a save that row-level security silently refused (zero rows back)', async () => {
    upsertSelect.mockResolvedValue({ data: [], error: null })
    const { saveTaxSettingsAction } = await loadActions()

    await expect(saveTaxSettingsAction(TENANT, 'sukad', values)).resolves.toEqual({
      success: false,
      error: 'Only the store owner can change tax and discount settings.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('turns an RLS refusal error into the same plain message', async () => {
    upsertSelect.mockResolvedValue({ data: null, error: { code: '42501', message: 'new row violates row-level security' } })
    const { saveTaxSettingsAction } = await loadActions()

    await expect(saveTaxSettingsAction(TENANT, 'sukad', values)).resolves.toMatchObject({
      success: false,
      error: 'Only the store owner can change tax and discount settings.',
    })
  })

  it('stops a staff member before any write', async () => {
    verifyTenantAdmin.mockResolvedValue(cashier)
    const { saveTaxSettingsAction } = await loadActions()

    await expect(saveTaxSettingsAction(TENANT, 'sukad', values)).resolves.toMatchObject({ success: false })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('returns field errors for an invalid form without touching the database', async () => {
    const { saveTaxSettingsAction } = await loadActions()

    const result = await saveTaxSettingsAction(TENANT, 'sukad', { ...values, tin: '12345' })

    expect(result).toMatchObject({ success: false, fieldErrors: { tin: expect.any(String) } })
    expect(verifyTenantAdmin).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('asks a signed-out visitor to sign in again', async () => {
    verifyTenantAdmin.mockRejectedValue(new Error('Unauthorized: Not authenticated'))
    const { saveTaxSettingsAction } = await loadActions()

    await expect(saveTaxSettingsAction(TENANT, 'sukad', values)).resolves.toEqual({
      success: false,
      error: 'Please sign in again to save these settings.',
    })
  })
})

describe('setApprovalPinAction', () => {
  it('sets the signed-in person’s own PIN, never one named in the request', async () => {
    setOwnApprovalPin.mockResolvedValue({ ok: true })
    const { setApprovalPinAction } = await loadActions()

    await expect(
      setApprovalPinAction(TENANT, { pin: '4826', confirmPin: '4826', userId: 'someone-else' }),
    ).resolves.toEqual({ success: true })
    expect(setOwnApprovalPin).toHaveBeenCalledWith(expect.anything(), TENANT, 'owner-1', '4826')
  })

  it('passes the server’s refusal through in its own words', async () => {
    setOwnApprovalPin.mockResolvedValue({ ok: false, status: 400, error: 'Pick a PIN that is harder to guess than that.' })
    const { setApprovalPinAction } = await loadActions()

    await expect(setApprovalPinAction(TENANT, { pin: '1111', confirmPin: '1111' })).resolves.toEqual({
      success: false,
      error: 'Pick a PIN that is harder to guess than that.',
    })
  })

  it('refuses mismatched PINs before calling the server', async () => {
    const { setApprovalPinAction } = await loadActions()

    await expect(setApprovalPinAction(TENANT, { pin: '4826', confirmPin: '4862' })).resolves.toEqual({
      success: false,
      error: 'The two PINs do not match',
    })
    expect(setOwnApprovalPin).not.toHaveBeenCalled()
  })
})
