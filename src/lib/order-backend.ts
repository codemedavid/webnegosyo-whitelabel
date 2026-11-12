/**
 * Where a tenant's orders are stored and served in real time.
 *
 * - `convex`   — the tenant's own dedicated Convex deployment.
 * - `platform` — the shared platform Supabase (where most stores live).
 *
 * A third backend, `supabase` (the tenant's own, fully separate Supabase
 * project), was removed on 2026-11-10: no store ever used it. The
 * `order_backend` column's CHECK constraint still accepts the word, so a stale
 * row or a stale client may still present it; it is never a routing target and
 * resolves exactly like `auto` (see `resolveOrderBackend`).
 */
export type OrderBackend = "convex" | "platform";

/**
 * What the `order_backend` column stores. `auto` is the default and means
 * "derive from the configured credentials": Convex when a deployment URL is
 * present, otherwise the shared platform database.
 *
 * `auto` exists so an unwritten column can never contradict the write path. The
 * column used to default to `platform`, which reads as a deliberate choice — a
 * tenant given a Convex deployment then had its orders written to Convex while
 * the admin queue read the empty platform database.
 */
export type OrderBackendPreference = OrderBackend | "auto";

const ORDER_BACKENDS: readonly OrderBackend[] = ["convex", "platform"];

/** The options a superadmin can pick in the tenant form. */
export const ORDER_BACKEND_PREFERENCES = ["auto", "platform", "convex"] as const;

export type SelectableOrderBackend = (typeof ORDER_BACKEND_PREFERENCES)[number];

/**
 * The subset of tenant columns needed to route order I/O. Accepting a
 * structural type (rather than the full `Tenant`) keeps this module pure and
 * trivially testable.
 */
export interface OrderBackendTenantFields {
  /**
   * Typed as the values this code writes. The column itself is free text with
   * a CHECK that still allows the retired `supabase`; `resolveOrderBackend`
   * validates whatever arrives at run time.
   */
  order_backend?: OrderBackendPreference | null;
  convex_deployment_url?: string | null;
  convex_deploy_key?: string | null;
}

/**
 * The columns to select when a server reader only needs to route: exactly what
 * `resolveOrderBackend` reads. Kept here so a reader asks the store's row and
 * this function, and never works the backend out from a request.
 */
export const ORDER_BACKEND_TENANT_COLUMNS = "order_backend, convex_deployment_url";

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolve the effective order backend for a tenant.
 *
 * A recognized pin (`convex`, `platform`) is a deliberate superadmin choice and
 * always wins. Anything else — `auto`, null, the retired `supabase`, or an
 * unrecognized value from a row written before this column existed — derives
 * from the credentials: a Convex deployment URL means Convex, otherwise the
 * shared platform database.
 *
 * Deriving on the default is what keeps reads and writes in agreement: checkout
 * routes through this same function, so an unwritten column cannot send orders
 * to one database while the merchant's queue watches another.
 */
export function resolveOrderBackend(tenant: OrderBackendTenantFields): OrderBackend {
  const pinned = tenant.order_backend;
  if (pinned && pinned !== "auto" && ORDER_BACKENDS.includes(pinned as OrderBackend)) {
    return pinned as OrderBackend;
  }
  return isNonEmpty(tenant.convex_deployment_url) ? "convex" : "platform";
}

/**
 * The preference to show as selected in the tenant form. Anything that is not
 * a pin this code recognizes (including the retired `supabase`) shows as
 * `auto`, which is how it routes.
 */
export function orderBackendPreferenceOf(
  tenant: OrderBackendTenantFields
): SelectableOrderBackend {
  const stored = tenant.order_backend;
  if (stored === "platform" || stored === "convex") return stored;
  return "auto";
}

/**
 * The value to persist in the `order_backend` column when a tenant is created or
 * updated, so the column always reflects a real decision instead of drifting.
 */
export function orderBackendForSave(
  preference: SelectableOrderBackend | null | undefined,
  tenant: OrderBackendTenantFields
): OrderBackendPreference {
  // Pinning to Convex without a deployment to pin to would strand the tenant's
  // orders, so fall back to auto and let the credentials decide.
  if (preference === "convex" && !isNonEmpty(tenant.convex_deployment_url)) return "auto";

  if (preference === "convex" || preference === "platform") return preference;
  return "auto";
}

/** The tenant-form fields that decide where orders go after a save. */
export interface BackendSaveInput {
  order_backend?: SelectableOrderBackend | null;
  convex_deployment_url?: string | null;
}

/**
 * Where the save would move this store's orders, or null when the resolved
 * backend stays put. An omitted/blank URL keeps the stored one (the writers
 * save it as `undefined`), exactly as the update payloads do.
 */
export function previewBackendChange(
  current: OrderBackendTenantFields,
  input: BackendSaveInput
): { from: OrderBackend; to: OrderBackend } | null {
  const url = isNonEmpty(input.convex_deployment_url)
    ? input.convex_deployment_url
    : current.convex_deployment_url ?? null;
  const next: OrderBackendTenantFields = {
    order_backend: orderBackendForSave(input.order_backend, {
      order_backend: current.order_backend,
      convex_deployment_url: url,
    }),
    convex_deployment_url: url,
  };
  const from = resolveOrderBackend(current);
  const to = resolveOrderBackend(next);
  return from === to ? null : { from, to };
}

function hasConvexCredentials(tenant: OrderBackendTenantFields): boolean {
  return (
    isNonEmpty(tenant.convex_deployment_url) && isNonEmpty(tenant.convex_deploy_key)
  );
}

/**
 * Throw a descriptive error when the selected backend is not fully configured.
 *
 * Call this on the checkout write path so a misconfigured tenant fails loudly
 * instead of silently falling back to the wrong database.
 */
export function assertOrderBackendReady(tenant: OrderBackendTenantFields): void {
  const backend = resolveOrderBackend(tenant);

  if (backend === "convex" && !hasConvexCredentials(tenant)) {
    throw new Error(
      "Order backend is set to Convex but the Convex deployment URL and deploy key are missing."
    );
  }
}
