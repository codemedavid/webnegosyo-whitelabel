import { superadminOnlyTenantChanges } from '@/lib/platform-staff/tenant-edit-scope'

const convexStore = {
  convex_deployment_url: 'https://happy-otter-1.convex.cloud',
  order_backend: 'convex',
}

describe('superadminOnlyTenantChanges', () => {
  it('allows a save that leaves the backend routing as it is', () => {
    const next = { convex_deployment_url: 'https://happy-otter-1.convex.cloud', order_backend: 'convex' as const }

    expect(superadminOnlyTenantChanges(convexStore, next)).toEqual([])
  })

  it('treats a blank and a missing Convex URL as the same value', () => {
    expect(
      superadminOnlyTenantChanges({ convex_deployment_url: null, order_backend: null }, { convex_deployment_url: '' }),
    ).toEqual([])
  })

  it('flags a changed Convex URL', () => {
    const next = { convex_deployment_url: 'https://evil-fox-9.convex.cloud', order_backend: 'convex' as const }

    expect(superadminOnlyTenantChanges(convexStore, next)).toEqual(['Convex deployment URL'])
  })

  it('flags a changed order backend', () => {
    const next = { convex_deployment_url: 'https://happy-otter-1.convex.cloud', order_backend: 'platform' as const }

    expect(superadminOnlyTenantChanges(convexStore, next)).toEqual(['order backend'])
  })

  it('reads an unset or unknown stored backend as auto', () => {
    expect(superadminOnlyTenantChanges({ order_backend: null }, { order_backend: 'auto' })).toEqual([])
    expect(superadminOnlyTenantChanges({ order_backend: 'supabase' }, { order_backend: 'auto' })).toEqual([])
  })

  it('flags any new Convex deploy key (blank keeps the stored one)', () => {
    expect(superadminOnlyTenantChanges(convexStore, { ...convexStore, order_backend: 'convex', convex_deploy_key: 'prod:x|y' }))
      .toEqual(['Convex deploy key'])
    expect(superadminOnlyTenantChanges(convexStore, { ...convexStore, order_backend: 'convex', convex_deploy_key: '' }))
      .toEqual([])
  })

  it('compares a new store against an unrouted one', () => {
    expect(superadminOnlyTenantChanges(null, { order_backend: 'auto', convex_deployment_url: '' })).toEqual([])
    expect(superadminOnlyTenantChanges(null, { order_backend: 'convex' })).toEqual(['order backend'])
  })
})
