/**
 * The vouchers section has to be reachable, and gated.
 *
 * A permission that no route consults is decoration. `permissionForAdminPath`
 * is what the layout uses to decide whether a staff member sees a section at
 * all, so a section missing from that map is visible to everyone who can reach
 * the admin — which for vouchers means anyone on staff can mint a standing
 * discount on the merchant's revenue.
 */
import { describe, it, expect } from '@jest/globals'
import {
  permissionForAdminPath,
  filterSidebarEntriesByPermission,
} from '@/lib/staff-permissions'
import { adminSidebarItems } from '@/components/shared/sidebar'

function labelsOf(entries: ReturnType<typeof filterSidebarEntriesByPermission>): string[] {
  return entries.flatMap((entry) =>
    'children' in entry && entry.children
      ? entry.children.map((child) => child.label)
      : [entry.label],
  )
}

describe('the vouchers admin section', () => {
  it('is gated by the vouchers permission', () => {
    expect(permissionForAdminPath('/admin/vouchers')).toBe('vouchers')
  })

  it('is gated the same way with a tenant prefix in the path', () => {
    expect(permissionForAdminPath('/my-shop/admin/vouchers')).toBe('vouchers')
  })

  it('appears in the sidebar', () => {
    expect(labelsOf(adminSidebarItems)).toContain('Vouchers')
  })

  it('is hidden from a staff member without the permission', () => {
    const staff = { role: 'admin', is_owner: false, permissions: ['orders', 'menu'] }

    expect(labelsOf(filterSidebarEntriesByPermission(adminSidebarItems, staff))).not.toContain(
      'Vouchers',
    )
  })

  it('is shown to a staff member who was granted it', () => {
    const staff = { role: 'admin', is_owner: false, permissions: ['orders', 'vouchers'] }

    expect(labelsOf(filterSidebarEntriesByPermission(adminSidebarItems, staff))).toContain(
      'Vouchers',
    )
  })
})
