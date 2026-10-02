import { readOnlyGrants, toggleGrant } from '@/lib/platform-staff/grant-editing'

describe('toggleGrant', () => {
  it('ticks view along with any other verb', () => {
    expect(toggleGrant([], 'tenants', 'delete', true)).toEqual(['tenants.view', 'tenants.delete'])
  })

  it('unticking view clears every verb in that section only', () => {
    const grants = ['tenants.view', 'tenants.edit', 'leads.view']
    expect(toggleGrant(grants, 'tenants', 'view', false)).toEqual(['leads.view'])
  })

  it('unticking a verb keeps view', () => {
    expect(toggleGrant(['tenants.view', 'tenants.edit'], 'tenants', 'edit', false)).toEqual(['tenants.view'])
  })

  it('never mutates its input', () => {
    const grants = Object.freeze(['leads.view']) as readonly string[]
    expect(() => toggleGrant(grants, 'leads', 'edit', true)).not.toThrow()
    expect(grants).toEqual(['leads.view'])
  })

  it('ignores a verb the section does not offer', () => {
    expect(toggleGrant([], 'subscriptions', 'delete', true)).toEqual([])
  })
})

describe('readOnlyGrants', () => {
  it('grants view on every section and nothing else', () => {
    const grants = readOnlyGrants()
    expect(grants.every((grant) => grant.endsWith('.view'))).toBe(true)
    expect(grants).toContain('stores.view')
    expect(grants).toContain('tenants.view')
  })
})
