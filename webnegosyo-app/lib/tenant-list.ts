// Search, filter and summary logic for the platform tenant list — the mobile
// counterpart of the web's tenant-manager toolbar. Pure functions so the screen
// stays presentational and the behaviour is unit-tested.

/** Per-tenant feature flags the list can filter on. */
export type TenantFeatureKey =
  | "menu_engineering_enabled"
  | "bundles_enabled"
  | "app_enabled"
  | "lalamove_enabled";

/** The tenant columns the list screen selects. */
export interface TenantListRow {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  convex_deployment_url: string | null;
  /** Optional: absent on rows selected before the logo column was added. */
  logo_url?: string | null;
  menu_engineering_enabled: boolean;
  bundles_enabled: boolean;
  app_enabled: boolean;
  lalamove_enabled: boolean;
}

export type TenantStatusFilter = "all" | "active" | "inactive";

export interface TenantListFilters {
  query: string;
  status?: TenantStatusFilter;
  feature?: TenantFeatureKey;
}

export interface TenantFeatureFilter {
  key: TenantFeatureKey;
  label: string;
}

export const FEATURE_FILTERS: readonly TenantFeatureFilter[] = [
  { key: "menu_engineering_enabled", label: "Menu Engineering" },
  { key: "bundles_enabled", label: "Bundles" },
  { key: "app_enabled", label: "Mobile App" },
  { key: "lalamove_enabled", label: "Lalamove" },
] as const;

function matchesQuery(tenant: TenantListRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    tenant.name.toLowerCase().includes(needle) ||
    tenant.slug.toLowerCase().includes(needle)
  );
}

function matchesStatus(
  tenant: TenantListRow,
  status: TenantStatusFilter
): boolean {
  if (status === "active") return tenant.is_active;
  if (status === "inactive") return !tenant.is_active;
  return true;
}

export function filterTenants(
  tenants: readonly TenantListRow[],
  filters: TenantListFilters
): TenantListRow[] {
  const status = filters.status ?? "all";
  return tenants.filter(
    (tenant) =>
      matchesQuery(tenant, filters.query) &&
      matchesStatus(tenant, status) &&
      (!filters.feature || tenant[filters.feature])
  );
}

/** Enabled-feature chips for a tenant row. */
export function tenantFeatureLabels(tenant: TenantListRow): string[] {
  return FEATURE_FILTERS.filter((f) => tenant[f.key]).map((f) => f.label);
}

export interface TenantSummary {
  total: number;
  active: number;
  inactive: number;
  withApp: number;
  withConvex: number;
}

/** Counters for the overview cards. */
export function summarizeTenants(
  tenants: readonly TenantListRow[]
): TenantSummary {
  const active = tenants.filter((t) => t.is_active).length;
  return {
    total: tenants.length,
    active,
    inactive: tenants.length - active,
    withApp: tenants.filter((t) => t.app_enabled).length,
    withConvex: tenants.filter((t) => t.convex_deployment_url !== null).length,
  };
}
