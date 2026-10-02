import { readFileSync } from 'fs'
import { join } from 'path'
import {
  canManageBranchMenu,
  canManageBranchStaff,
  canManageOutlets,
  canViewBranchDirectory,
  resolveBranchScope,
} from '@/lib/outlets/branch-scope'
import { canManageStaff } from '@/lib/staff-permissions'

/**
 * Platform staff are held to `stores.<verb>` by the verb each store call site
 * names. A call that names none is treated as a write (`edit`), so a read that
 * forgets its verb locks read-only staff out, and a delete that forgets its
 * verb lets an editor delete. These pins read the source so a refactor that
 * drops the verb fails here rather than in production.
 */

const ROOT = join(__dirname, '..', '..', '..')

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), 'utf8')
}

/** The body of `export async function <name>` up to the next top-level export. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  if (start === -1) throw new Error(`${name} not found`)
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

const SITES: ReadonlyArray<readonly [string, string, RegExp]> = [
  ['src/lib/customers-service.ts', 'getCustomersPage', /verifyTenantPermission\(tenantId, 'customers', 'view'\)/],
  ['src/lib/orders-service.ts', 'getOrdersByTenant', /verifyTenantPermission\(tenantId, 'orders', 'view'\)/],
  ['src/app/actions/voucher-admin.ts', 'listVouchersAction', /verifyTenantPermission\(tenantId, 'vouchers', 'view'\)/],
  ['src/lib/payment-methods-service.ts', 'createPaymentMethod', /verifyTenantPermission\(tenantId, 'store_setup', 'create'\)/],
  ['src/lib/inventory/ingredients-service.ts', 'createIngredient', /verifyTenantPermission\(tenantId, 'menu', 'create'\)/],
  ['src/lib/payment-methods-service.ts', 'deletePaymentMethod', /verifyTenantPermission\(tenantId, 'store_setup', 'delete'\)/],
  ['src/lib/bundles-service.ts', 'deleteBundle', /verifyTenantPermission\(tenantId, 'menu', 'delete'\)/],
  ['src/lib/order-types-service.ts', 'deleteOrderType', /verifyTenantPermission\(tenantId, 'store_setup', 'delete'\)/],
  // An RLS-bound replace-the-set write deletes rows: without stores.delete the
  // delete is silently filtered and the re-insert duplicates.
  ['src/lib/inventory/recipes-service.ts', 'saveRecipeForTarget', /verifyTenantPermission\(tenantId, 'menu', 'delete'\)/],
  ['src/app/actions/voucher-admin.ts', 'saveVoucherAction', /verifyTenantPermission\(tenantId, 'vouchers', voucherId \? 'edit' : 'create'\)/],
]

describe('store call sites name their platform-staff verb', () => {
  it.each(SITES)('%s %s', (file, name, pattern) => {
    expect(functionBody(read(file), name)).toMatch(pattern)
  })

  it('leaves plain updates on the default (edit) verb', () => {
    const body = functionBody(read('src/lib/payment-methods-service.ts'), 'updatePaymentMethod')
    expect(body).toMatch(/verifyTenantPermission\(tenantId, 'store_setup'\)/)
  })
})

const CONVERTED_ROUTES = [
  'src/app/api/customers/hub-overview/route.ts',
  'src/app/api/customers/capture-order/route.ts',
  'src/app/api/customers/sync-order-lifecycle/route.ts',
  'src/app/api/inventory/transfers/route.ts',
  'src/app/api/inventory/movement/route.ts',
  'src/app/api/inventory/order-stock/route.ts',
  'src/app/api/vouchers/redeem/route.ts',
  'src/app/api/vouchers/lookup/route.ts',
  'src/app/api/vouchers/list/route.ts',
  'src/app/api/lalamove/route.ts',
  'src/app/api/staff/order-activity/route.ts',
  'src/app/api/orders/tracking-url/route.ts',
  'src/app/api/revalidate-menu/route.ts',
  'src/app/api/loyverse/route.ts',
  'src/lib/storefront/brand-admin.ts',
  'src/components/admin/product-detail-customizer.tsx',
  'src/components/auth/tenant-login-form.tsx',
  'src/app/[tenant]/admin/layout.tsx',
]

// `role === 'superadmin' || (role === 'admin' && tenant_id === X)` refuses
// platform staff outright; these doors go through canAccessStoreAdmin instead.
const INLINE_STORE_CHECK = /===\s*'superadmin'\s*\|\|\s*\(\s*\w+\??\.role\s*===\s*'admin'\s*&&\s*\w+\.tenant_id\s*===/

describe('converted store doors use canAccessStoreAdmin', () => {
  it.each(CONVERTED_ROUTES)('%s', (file) => {
    const source = read(file)
    expect(source).not.toMatch(INLINE_STORE_CHECK)
    expect(source).toMatch(/canAccessStoreAdmin\(/)
  })

  it('reads the platform grants through the resilient app_users helper', () => {
    for (const file of CONVERTED_ROUTES.filter((path) => path.startsWith('src/app/api/'))) {
      expect(read(file)).toContain('fetchAppUserScope(')
    }
  })
})

describe('branch scope for platform staff', () => {
  const staff = { role: 'platform_staff', is_owner: false, outlet_id: null, permissions: null }

  it('is store-wide, like a superadmin', () => {
    expect(resolveBranchScope(staff)).toEqual({ kind: 'all' })
    expect(canViewBranchDirectory(staff)).toBe(true)
    expect(canManageOutlets(staff)).toBe(true)
    expect(canManageBranchMenu(staff, 'outlet-south')).toBe(true)
  })

  it('never manages staff', () => {
    expect(canManageStaff(staff)).toBe(false)
    expect(canManageBranchStaff(staff, 'outlet-south')).toBe(false)
    expect(canManageBranchStaff(staff, null)).toBe(false)
  })
})
