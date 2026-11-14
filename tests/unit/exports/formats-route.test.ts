/** @jest-environment node */
/**
 * POST /api/exports/formats: only a store-wide account with Reports gets in,
 * the body is strict, and a refusal the person can act on keeps its sentence.
 */
import { NextRequest } from 'next/server'
import { customReportSpecSchema } from '@/lib/exports/custom-report'
import { ExportError } from '@/lib/exports/errors'

const mockVerifyPermission = jest.fn()
const mockSave = jest.fn()
const mockRemove = jest.fn()

// The access check is the app's existing helper; `defineRoute` and everything after it are real.
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn(),
  verifyTenantPermission: (...args: unknown[]) => mockVerifyPermission(...args),
}))
jest.mock('@/lib/exports/server/report-templates', () => ({
  saveReportTemplate: (...args: unknown[]) => mockSave(...args),
  removeReportTemplate: (...args: unknown[]) => mockRemove(...args),
}))

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
const ID = 'bbbbbbbb-0000-4000-8000-000000000001'
const spec = customReportSpecSchema.parse({ title: 'Average order per day', sheet: 'sales_by_day', columns: [{ id: 'day' }, { id: 'aov' }] })

async function post(body: unknown) {
  const { POST } = await import('@/app/api/exports/formats/route')
  return POST(new NextRequest('http://localhost/api/exports/formats', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
}

function caller(overrides: Record<string, unknown> = {}) {
  return { user: { id: 'user-1' }, userRole: { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['reports'], outlet_id: null, ...overrides } }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockVerifyPermission.mockResolvedValue(caller())
  mockSave.mockResolvedValue({ id: ID, name: 'Weekly' })
  mockRemove.mockResolvedValue(undefined)
})
afterEach(() => jest.restoreAllMocks())

describe('POST /api/exports/formats', () => {
  it('saves a format for the caller’s store, as the caller', async () => {
    const response = await post({ action: 'save', tenantId: TENANT, name: 'Weekly', spec })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, format: { id: ID, name: 'Weekly' } })
    expect(mockSave).toHaveBeenCalledWith({ tenantId: TENANT, userId: 'user-1', name: 'Weekly', spec })
    // A write: a platform-staff account would need `stores.edit`.
    expect(mockVerifyPermission).toHaveBeenCalledWith(TENANT, 'reports', 'edit')
  })

  it('removes one', async () => {
    const response = await post({ action: 'remove', tenantId: TENANT, id: ID })
    expect(response.status).toBe(200)
    expect(mockRemove).toHaveBeenCalledWith(TENANT, ID)
  })

  it('refuses a branch-locked account before anything is written', async () => {
    mockVerifyPermission.mockResolvedValue(caller({ outlet_id: 'cccccccc-0000-4000-8000-000000000001' }))
    const response = await post({ action: 'save', tenantId: TENANT, name: 'Weekly', spec })
    expect(response.status).toBe(403)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('refuses an account the access check turns away', async () => {
    mockVerifyPermission.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    const response = await post({ action: 'save', tenantId: TENANT, name: 'Weekly', spec })
    expect(response.status).toBe(403)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown action', { action: 'rename', tenantId: TENANT, id: ID, name: 'x' }],
    ['an extra field', { action: 'remove', tenantId: TENANT, id: ID, all: true }],
    ['a spec that carries figures', { action: 'save', tenantId: TENANT, name: 'Weekly', spec: { ...spec, rows: [[1, 2]] } }],
    ['a name that starts a formula', { action: 'save', tenantId: TENANT, name: '=1+1', spec }],
  ])('refuses %s', async (_label, body) => {
    const response = await post(body)
    expect(response.status).toBe(400)
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('keeps the sentence of a refusal the person can act on, and hides anything else', async () => {
    mockSave.mockRejectedValue(new ExportError('You already have a format called “Weekly”. Remove it first, or save this one under another name.', 409))
    const taken = await post({ action: 'save', tenantId: TENANT, name: 'Weekly', spec })
    expect(taken.status).toBe(409)
    expect((await taken.json()).error).toMatch(/already have a format/)

    mockSave.mockRejectedValue(new Error('connection reset by peer at 10.0.0.4'))
    const broken = await post({ action: 'save', tenantId: TENANT, name: 'Weekly', spec })
    expect(broken.status).toBe(500)
    expect((await broken.json()).error).toBe('That could not be saved. Try again in a moment.')
  })
})
