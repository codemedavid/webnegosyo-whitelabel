/**
 * @jest-environment node
 *
 * `.or()` takes a raw PostgREST filter string, so caller text must not be able
 * to add a condition or close the group.
 */
const orCalls: string[] = []
const ilikeCalls: string[] = []

function fakeSupabase() {
  const builder: Record<string, unknown> = {}
  builder.eq = () => builder
  builder.ilike = (_column: string, value: string) => { ilikeCalls.push(value); return builder }
  builder.or = (filter: string) => { orCalls.push(filter); return builder }
  builder.order = () => builder
  builder.range = () => builder
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve)
  return { from: () => ({ select: () => builder }) }
}

jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: jest.fn(async () => undefined) }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn(async () => fakeSupabase()) }))
jest.mock('@/lib/phone', () => ({
  ...jest.requireActual('@/lib/phone'),
  normalizePhoneE164: jest.fn(() => '+639171234567'),
}))

describe('customer search', () => {
  beforeEach(() => {
    orCalls.length = 0
    ilikeCalls.length = 0
  })

  it('cannot add a condition or close the group through .or()', async () => {
    const { getCustomersByTenant } = await import('@/lib/customers-service')

    await getCustomersByTenant('tenant_1', { search: '0917),tenant_id.neq.x,(name.ilike.*%' })

    expect(orCalls).toHaveLength(1)
    const name = orCalls[0].split(',phone_e164.eq.')[0]
    expect(name.startsWith('name.ilike.%')).toBe(true)
    expect(name.slice('name.ilike.%'.length, -1)).not.toMatch(/[,()*%]/)
    expect(orCalls[0].endsWith(',phone_e164.eq.+639171234567')).toBe(true)
  })

  it('leaves an ordinary search alone', async () => {
    const { getCustomersByTenant } = await import('@/lib/customers-service')

    await getCustomersByTenant('tenant_1', { search: '0917 123 4567' })

    expect(orCalls[0]).toBe('name.ilike.%0917 123 4567%,phone_e164.eq.+639171234567')
  })
})
