import {
  STAFF_PERMISSION_KEYS,
  MAX_STAFF_PER_TENANT,
  hasPermission,
  canManageStaff,
  canAddStaff,
  validatePermissionKeys,
  permissionForAdminPath,
  permissionForMobileTab,
  permissionForPosScreen,
  filterSidebarEntriesByPermission,
  type PermissionHolder,
} from '@/lib/staff-permissions'

const owner: PermissionHolder = { role: 'admin', is_owner: true, permissions: null }
const superadmin: PermissionHolder = { role: 'superadmin', is_owner: false, permissions: null }
const legacyAdmin: PermissionHolder = { role: 'admin', is_owner: false, permissions: null }
const ordersOnlyStaff: PermissionHolder = { role: 'admin', is_owner: false, permissions: ['orders'] }

describe('staff permission registry', () => {
  it('defines the expected permission keys', () => {
    expect(STAFF_PERMISSION_KEYS).toEqual([
      'orders',
      'menu',
      'analytics',
      'store_setup',
      'customers',
      'settings',
      'pos',
      // Multi-branch: lets a branch admin manage staff at its own branch only.
      'branch_staff',
      // Order editing: rewriting a placed bill, and returning money on it.
      // Separate from 'orders', which only advances status.
      'order_edit',
      'order_refund',
    ])
  })

  it('caps staff at 3 per tenant', () => {
    expect(MAX_STAFF_PER_TENANT).toBe(3)
  })
})

describe('hasPermission', () => {
  it('grants everything to the tenant owner', () => {
    expect(hasPermission(owner, 'analytics')).toBe(true)
    expect(hasPermission(owner, 'pos')).toBe(true)
  })

  it('grants everything to superadmins', () => {
    expect(hasPermission(superadmin, 'orders')).toBe(true)
  })

  it('treats null permissions as full access for backward compatibility', () => {
    expect(hasPermission(legacyAdmin, 'analytics')).toBe(true)
  })

  it('grants only listed permissions to restricted staff', () => {
    expect(hasPermission(ordersOnlyStaff, 'orders')).toBe(true)
    expect(hasPermission(ordersOnlyStaff, 'analytics')).toBe(false)
    expect(hasPermission(ordersOnlyStaff, 'menu')).toBe(false)
  })
})

describe('canManageStaff', () => {
  it('allows owners and superadmins only', () => {
    expect(canManageStaff(owner)).toBe(true)
    expect(canManageStaff(superadmin)).toBe(true)
    expect(canManageStaff(ordersOnlyStaff)).toBe(false)
    expect(canManageStaff(legacyAdmin)).toBe(false)
  })
})

describe('canAddStaff', () => {
  it('allows adding staff below the limit', () => {
    expect(canAddStaff(0)).toBe(true)
    expect(canAddStaff(2)).toBe(true)
  })

  it('rejects adding staff at or above the limit', () => {
    expect(canAddStaff(3)).toBe(false)
    expect(canAddStaff(4)).toBe(false)
  })
})

describe('validatePermissionKeys', () => {
  it('accepts a list of valid keys', () => {
    expect(validatePermissionKeys(['orders', 'menu'])).toEqual(['orders', 'menu'])
  })

  it('deduplicates repeated keys', () => {
    expect(validatePermissionKeys(['orders', 'orders'])).toEqual(['orders'])
  })

  it('throws on unknown keys', () => {
    expect(() => validatePermissionKeys(['orders', 'hacking'])).toThrow(/hacking/)
  })

  it('throws on non-array input', () => {
    expect(() => validatePermissionKeys('orders')).toThrow()
  })

  it('throws on an empty list', () => {
    expect(() => validatePermissionKeys([])).toThrow(/at least one/i)
  })
})

describe('permissionForAdminPath', () => {
  it('maps orders routes', () => {
    expect(permissionForAdminPath('/my-resto/admin/orders')).toBe('orders')
  })

  it('maps menu, categories, and bundles to menu', () => {
    expect(permissionForAdminPath('/my-resto/admin/menu')).toBe('menu')
    expect(permissionForAdminPath('/my-resto/admin/categories')).toBe('menu')
    expect(permissionForAdminPath('/my-resto/admin/bundles')).toBe('menu')
  })

  it('maps growth features to analytics', () => {
    expect(permissionForAdminPath('/my-resto/admin/boost-sales')).toBe('analytics')
    expect(permissionForAdminPath('/my-resto/admin/product-analytics')).toBe('analytics')
    expect(permissionForAdminPath('/my-resto/admin/menu-engineering')).toBe('analytics')
  })

  it('maps store setup routes', () => {
    expect(permissionForAdminPath('/my-resto/admin/order-types')).toBe('store_setup')
    expect(permissionForAdminPath('/my-resto/admin/payment-methods')).toBe('store_setup')
    expect(permissionForAdminPath('/my-resto/admin/branding')).toBe('store_setup')
    expect(permissionForAdminPath('/my-resto/admin/hero-designer')).toBe('store_setup')
  })

  it('maps branches to store setup', () => {
    // Branches are store configuration, so they ride the same permission as
    // order types and payment methods rather than introducing a new key.
    expect(permissionForAdminPath('/my-resto/admin/outlets')).toBe('store_setup')
  })

  it('maps customers routes', () => {
    expect(permissionForAdminPath('/my-resto/admin/customers')).toBe('customers')
  })

  it('leaves the dashboard and settings ungated', () => {
    expect(permissionForAdminPath('/my-resto/admin')).toBeNull()
    expect(permissionForAdminPath('/my-resto/admin/settings')).toBeNull()
  })

  it('handles nested paths under a gated section', () => {
    expect(permissionForAdminPath('/my-resto/admin/menu/item/123')).toBe('menu')
  })

  it('returns null for non-admin paths', () => {
    expect(permissionForAdminPath('/my-resto/menu')).toBeNull()
  })
})

describe('permissionForMobileTab', () => {
  it('gates orders and dashboard tabs by orders access', () => {
    expect(permissionForMobileTab('orders')).toBe('orders')
    expect(permissionForMobileTab('dashboard')).toBeNull()
  })

  it('gates insights tabs by analytics access', () => {
    expect(permissionForMobileTab('analytics')).toBe('analytics')
    expect(permissionForMobileTab('growth')).toBe('analytics')
    expect(permissionForMobileTab('trends')).toBe('analytics')
    expect(permissionForMobileTab('product-analytics')).toBe('analytics')
  })

  it('gates product management by menu access', () => {
    expect(permissionForMobileTab('product-management')).toBe('menu')
  })
})

describe('permissionForPosScreen', () => {
  it('maps POS screens to permission keys', () => {
    expect(permissionForPosScreen('pos')).toBe('pos')
    expect(permissionForPosScreen('orders')).toBe('orders')
  })
})

describe('filterSidebarEntriesByPermission', () => {
  const entries = [
    { label: 'Dashboard', href: '/admin' },
    {
      label: 'Menu',
      children: [
        { label: 'Menu Management', href: '/admin/menu' },
        { label: 'Categories', href: '/admin/categories' },
      ],
    },
    {
      label: 'Analytics',
      children: [
        { label: 'Boost Sales', href: '/admin/boost-sales' },
        { label: 'Product Analytics', href: '/admin/product-analytics' },
      ],
    },
    { label: 'Orders', href: '/admin/orders' },
    { label: 'Settings', href: '/admin/settings' },
  ]

  it('keeps everything for the owner', () => {
    expect(filterSidebarEntriesByPermission(entries, owner)).toHaveLength(entries.length)
  })

  it('drops gated leaves and empty groups for restricted staff', () => {
    const filtered = filterSidebarEntriesByPermission(entries, ordersOnlyStaff)
    const labels = filtered.map((entry) => entry.label)
    expect(labels).toEqual(['Dashboard', 'Orders', 'Settings'])
  })

  it('keeps a group when at least one child is permitted', () => {
    const staff: PermissionHolder = { role: 'admin', is_owner: false, permissions: ['menu'] }
    const filtered = filterSidebarEntriesByPermission(entries, staff)
    const menuGroup = filtered.find((entry) => entry.label === 'Menu')
    expect(menuGroup).toBeDefined()
    expect(filtered.find((entry) => entry.label === 'Analytics')).toBeUndefined()
  })

  it('does not mutate the input entries', () => {
    const snapshot = JSON.parse(JSON.stringify(entries))
    filterSidebarEntriesByPermission(entries, ordersOnlyStaff)
    expect(entries).toEqual(snapshot)
  })
})
