/**
 * The admin shell is a client component rendered on EVERY admin page, so the
 * tenant handed to it is serialized into every admin RSC payload. It used to be
 * the full `select('*')` row — 40+ branding columns, the hero design JSON, and
 * whatever credential column a future migration adds. The projection keeps only
 * what the sidebar renders, so neither the payload nor a new secret column can
 * ride along by accident.
 */

import { toAdminShellTenant } from '@/lib/admin-shell-tenant'
import type { Tenant } from '@/types/database'

const FULL_ROW = {
  id: 't1',
  slug: 'seacook',
  name: 'SeaCook',
  logo_url: 'https://img.example/logo.png',
  enable_order_management: true,
  menu_engineering_enabled: false,
  bundles_enabled: true,
  convex_deployment_url: 'https://avid-ox-80.convex.cloud',
  inventory_enabled: true,
  multi_branch_enabled: false,
  assistant_enabled: true,
  hero_design: '{"version":5,"sections":[]}',
  primary_color: '#ff6b00',
  supabase_order_service_key: 'secret-service-role-key',
} as unknown as Tenant

describe('toAdminShellTenant', () => {
  test('keeps exactly the fields the admin sidebar renders', () => {
    // Act
    const shell = toAdminShellTenant(FULL_ROW)

    // Assert
    expect(shell).toEqual({
      id: 't1',
      name: 'SeaCook',
      logo_url: 'https://img.example/logo.png',
      enable_order_management: true,
      menu_engineering_enabled: false,
      bundles_enabled: true,
      is_convex_configured: true,
      inventory_enabled: true,
      multi_branch_enabled: false,
      assistant_enabled: true,
      has_start_here: false,
    })
  })

  test('never forwards credential or design columns to the browser', () => {
    const serialized = JSON.stringify(toAdminShellTenant(FULL_ROW))

    expect(serialized).not.toContain('secret-service-role-key')
    expect(serialized).not.toContain('hero_design')
    expect(serialized).not.toContain('convex.cloud')
  })

  test('keeps an unset order-management flag unset, so the sidebar still shows Orders', () => {
    // hiddenAdminSidebarPaths hides /orders only on a strict `false`; rows
    // created before the column existed read as undefined and must not flip.
    const shell = toAdminShellTenant({ ...FULL_ROW, enable_order_management: undefined } as unknown as Tenant)

    expect(shell.enable_order_management).toBeNull()
  })

  test('reads a tenant without a Convex deployment as not configured', () => {
    const shell = toAdminShellTenant({ ...FULL_ROW, convex_deployment_url: null } as Tenant)

    expect(shell.is_convex_configured).toBe(false)
  })

  test('treats an unset assistant flag as off, so the owl only appears where a superadmin enabled it', () => {
    const shell = toAdminShellTenant({ ...FULL_ROW, assistant_enabled: undefined } as unknown as Tenant)

    expect(shell.assistant_enabled).toBe(false)
  })
})
