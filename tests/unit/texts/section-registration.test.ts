/**
 * /admin/texts is a real section: in the sidebar's Grow group right after
 * Loyalty, gated by `customers` (the middleware redirects without it), and
 * store-wide only (the middleware redirects branch accounts; the sidebar
 * hides it from them).
 */
import { describe, it, expect } from '@jest/globals'
import { filterSidebarEntriesByPermission, permissionForAdminPath } from '@/lib/staff-permissions'
import { isStoreWideAdminPath } from '@/lib/outlets/branch-scope'
import { hiddenAdminSidebarPaths, isHiddenAdminHref } from '@/lib/admin-sidebar-visibility'
import { adminSidebarItems } from '@/components/shared/sidebar'

const labels = (entries: typeof adminSidebarItems) => entries.map((entry) => entry.label)

describe('the Texts admin section', () => {
  it('sits in Grow right after Loyalty', () => {
    const all = labels(adminSidebarItems)
    expect(all.indexOf('Texts')).toBe(all.indexOf('Loyalty') + 1)
    expect(adminSidebarItems.find((entry) => entry.label === 'Texts')).toMatchObject({ href: '/admin/texts', section: 'Grow' })
  })

  it('is gated by customers, nested pages included', () => {
    expect(permissionForAdminPath('/shop/admin/texts')).toBe('customers')
    expect(permissionForAdminPath('/shop/admin/texts/campaigns/abc')).toBe('customers')
  })

  it('is hidden from staff without customers and shown to staff with it', () => {
    const without = { role: 'admin', is_owner: false, permissions: ['orders'] }
    const withIt = { role: 'admin', is_owner: false, permissions: ['customers'] }
    expect(labels(filterSidebarEntriesByPermission(adminSidebarItems, without))).not.toContain('Texts')
    expect(labels(filterSidebarEntriesByPermission(adminSidebarItems, withIt))).toContain('Texts')
  })

  it('is store-wide only', () => {
    expect(isStoreWideAdminPath('/shop/admin/texts')).toBe(true)
    expect(isHiddenAdminHref('/shop/admin/texts', hiddenAdminSidebarPaths({ isBranchScopedAccount: true }))).toBe(true)
    expect(isHiddenAdminHref('/shop/admin/texts', hiddenAdminSidebarPaths({ isBranchScopedAccount: false }))).toBe(false)
  })
})
