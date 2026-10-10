import type { Tenant } from '@/types/database'

/**
 * The slice of a tenant the admin shell (sidebar + mobile header) renders.
 *
 * The shell is a client component on every admin page, so whatever it receives
 * is serialized into every admin RSC payload. Handing it the full `select('*')`
 * row shipped 40+ branding columns and the hero design JSON on each navigation,
 * and would forward any credential column a future migration adds. Lives
 * outside the 'use client' module so the server layout can call it.
 */
export interface AdminShellTenant {
  /** Not a secret; the assistant addresses its API by it. */
  id: string
  name: string
  logo_url: string | null
  /**
   * Flags pass through un-coerced (null when unset): the sidebar hides Orders
   * only on a strict `false`, so an unset flag must not become `false` here.
   */
  enable_order_management: boolean | null
  menu_engineering_enabled: boolean | null
  bundles_enabled: boolean | null
  /** Whether a Convex deployment is set — the URL itself stays on the server. */
  is_convex_configured: boolean
  inventory_enabled: boolean | null
  multi_branch_enabled: boolean | null
  /** Owner AI assistant ("the Owl"). Coerced: only a strict `true` shows it. */
  assistant_enabled: boolean
  /** In its first weeks after onboarding: the sidebar offers "Start here". */
  has_start_here: boolean
}

export function toAdminShellTenant(tenant: Tenant, opts: { hasStartHere?: boolean } = {}): AdminShellTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    logo_url: tenant.logo_url || null,
    enable_order_management: tenant.enable_order_management ?? null,
    menu_engineering_enabled: tenant.menu_engineering_enabled ?? null,
    bundles_enabled: tenant.bundles_enabled ?? null,
    is_convex_configured: !!tenant.convex_deployment_url,
    inventory_enabled: tenant.inventory_enabled ?? null,
    multi_branch_enabled: tenant.multi_branch_enabled ?? null,
    assistant_enabled: tenant.assistant_enabled === true,
    has_start_here: opts.hasStartHere === true,
  }
}
