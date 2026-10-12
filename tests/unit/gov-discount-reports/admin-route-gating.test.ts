/**
 * The Senior & PWD section must be reachable, and gated on discount_review —
 * the same key the ledger's RLS checks, so the menu never offers a page whose
 * reads would come back empty.
 */
import { filterSidebarEntriesByPermission, permissionForAdminPath } from '@/lib/staff-permissions'
import { adminSidebarItems } from '@/components/shared/sidebar'

function labelsOf(entries: ReturnType<typeof filterSidebarEntriesByPermission>): string[] {
  return entries.flatMap((entry) =>
    'children' in entry && entry.children ? entry.children.map((child) => child.label) : [entry.label],
  )
}

describe('the Senior & PWD admin section', () => {
  it('is gated by discount_review, with or without a tenant prefix', () => {
    expect(permissionForAdminPath('/admin/gov-discounts')).toBe('discount_review')
    expect(permissionForAdminPath('/my-shop/admin/gov-discounts')).toBe('discount_review')
  })

  it('appears in the sidebar for the owner', () => {
    expect(labelsOf(filterSidebarEntriesByPermission(adminSidebarItems, { role: 'admin', is_owner: true }))).toContain(
      'Senior & PWD',
    )
  })

  it('is hidden from a cashier without the permission', () => {
    const cashier = { role: 'admin', is_owner: false, permissions: ['pos', 'orders'] }
    expect(labelsOf(filterSidebarEntriesByPermission(adminSidebarItems, cashier))).not.toContain('Senior & PWD')
  })

  it('is shown to a manager granted discount_review', () => {
    const manager = { role: 'admin', is_owner: false, permissions: ['orders', 'discount_review'] }
    expect(labelsOf(filterSidebarEntriesByPermission(adminSidebarItems, manager))).toContain('Senior & PWD')
  })
})
