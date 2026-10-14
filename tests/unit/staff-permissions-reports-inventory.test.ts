/**
 * Phase 0d: the `reports`, `inventory` and `costs` keys (plan §6.1).
 *
 *   reports   is implied by analytics (it is a strict subset of what
 *             Growth & Analytics already showed);
 *   inventory and costs are carved out of menu and are NOT implied by it —
 *             the database backfilled them once onto every menu holder, so
 *             an owner can now hand out the menu without the shelf or the
 *             margins.
 *
 * The route guardrail at the bottom is the one that matters most: an admin
 * section missing from the map is OPEN to every staff account, so every
 * directory under src/app/[tenant]/admin must either be mapped or be listed,
 * with a reason, as deliberately open.
 */
import { readdirSync } from 'fs'
import path from 'path'
import {
  STAFF_PERMISSION_KEYS,
  STAFF_PERMISSION_LABELS,
  IMPLIED_BY,
  OPEN_ADMIN_SECTIONS,
  ORDER_READ_KEYS,
  PAYMENT_READ_KEYS,
  hasAnyPermission,
  editablePermissions,
  hasPermission,
  impliedPermissions,
  permissionForAdminPath,
  validatePermissionKeys,
  type PermissionHolder,
} from '@/lib/staff-permissions'

const staff = (permissions: string[] | null): PermissionHolder => ({
  role: 'admin',
  is_owner: false,
  permissions,
})

describe('the three report & inventory keys', () => {
  it('are registered, after every existing key, with a label and description', () => {
    expect(STAFF_PERMISSION_KEYS.slice(-3)).toEqual(['reports', 'inventory', 'costs'])
    for (const key of ['reports', 'inventory', 'costs'] as const) {
      expect(STAFF_PERMISSION_LABELS[key].label).not.toHaveLength(0)
      expect(STAFF_PERMISSION_LABELS[key].description).not.toHaveLength(0)
    }
  })

  it('are accepted by the validator the staff actions use', () => {
    expect(validatePermissionKeys(['reports', 'inventory', 'costs'])).toEqual([
      'reports',
      'inventory',
      'costs',
    ])
  })

  it('gives reports to whoever holds Growth & Analytics, and only by containment', () => {
    expect(IMPLIED_BY.reports).toBe('analytics')
    expect(hasPermission(staff(['analytics']), 'reports')).toBe(true)
    expect(hasPermission(staff(['reports']), 'analytics')).toBe(false)
    expect(impliedPermissions(['analytics'])).toEqual(['reports'])
  })

  it('never gives reports to the live order queue or the register', () => {
    expect(hasPermission(staff(['orders', 'pos', 'kitchen', 'tables']), 'reports')).toBe(false)
  })

  it('does not derive inventory or costs from menu', () => {
    expect(IMPLIED_BY.inventory).toBeUndefined()
    expect(IMPLIED_BY.costs).toBeUndefined()
    expect(hasPermission(staff(['menu']), 'inventory')).toBe(false)
    expect(hasPermission(staff(['menu']), 'costs')).toBe(false)
    expect(hasPermission(staff(['inventory']), 'costs')).toBe(false)
    expect(hasPermission(staff(['costs']), 'inventory')).toBe(false)
  })

  it('still gives all three to legacy full access and to the owner', () => {
    for (const key of ['reports', 'inventory', 'costs'] as const) {
      expect(hasPermission(staff(null), key)).toBe(true)
      expect(hasPermission({ role: 'admin', is_owner: true, permissions: [] }, key)).toBe(true)
    }
  })
})

describe('who may read orders (HIGH-3)', () => {
  it('lets every screen that shows orders read them', () => {
    expect([...ORDER_READ_KEYS]).toEqual(['orders', 'pos', 'kitchen', 'tables', 'analytics', 'reports'])
  })

  it('keeps the till away from the kitchen display', () => {
    expect([...PAYMENT_READ_KEYS]).toEqual(['orders', 'pos', 'tables', 'analytics', 'reports'])
    expect(PAYMENT_READ_KEYS).not.toContain('kitchen')
  })

  it('refuses orders to menu, stock, cost, customer and staff-only accounts', () => {
    for (const only of ['menu', 'inventory', 'costs', 'customers', 'branch_staff', 'vouchers']) {
      expect(hasAnyPermission(staff([only]), ORDER_READ_KEYS)).toBe(false)
    }
    expect(hasAnyPermission(staff(['kitchen']), ORDER_READ_KEYS)).toBe(true)
    expect(hasAnyPermission(staff(null), ORDER_READ_KEYS)).toBe(true)
  })
})

describe('editablePermissions', () => {
  it('opens a legacy full-access account with everything it can do ticked', () => {
    // Opening it with nothing ticked made "Save" strip every grant at once —
    // the exact edit the Review staff access prompt sends owners to make.
    expect(editablePermissions(null)).toEqual([...STAFF_PERMISSION_KEYS])
  })

  it('copies a list unchanged, unknown keys included', () => {
    const stored = ['menu', 'future_key']
    const editable = editablePermissions(stored)
    expect(editable).toEqual(['menu', 'future_key'])
    expect(editable).not.toBe(stored)
  })
})

describe('admin route map', () => {
  it('gates the stock pages on inventory, not menu', () => {
    expect(permissionForAdminPath('/acme/admin/inventory')).toBe('inventory')
    expect(permissionForAdminPath('/acme/admin/inventory/transfers')).toBe('inventory')
    expect(permissionForAdminPath('/acme/admin/inventory/log')).toBe('inventory')
  })

  it('gates the sales reports on reports', () => {
    expect(permissionForAdminPath('/acme/admin/reports')).toBe('reports')
    expect(permissionForAdminPath('/acme/admin/reports/items')).toBe('reports')
  })

  it('gates the add-on library on menu (it was open to every account)', () => {
    expect(permissionForAdminPath('/acme/admin/addons')).toBe('menu')
  })
})

describe('admin route guardrail', () => {
  const adminDir = path.join(process.cwd(), 'src', 'app', '[tenant]', 'admin')
  const sections = readdirSync(adminDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  it.each(sections)('/admin/%s is gated or deliberately open', (section) => {
    const isMapped = permissionForAdminPath(`/acme/admin/${section}`) !== null
    const isOpen = (OPEN_ADMIN_SECTIONS as readonly string[]).includes(section)
    expect({ section, isMapped, isOpen }).toEqual({ section, isMapped: !isOpen, isOpen })
  })

  it('lists no open section that does not exist', () => {
    for (const section of OPEN_ADMIN_SECTIONS) {
      expect(sections).toContain(section)
    }
  })
})
