/**
 * The storefront hands tenant rows to client components, which serialises
 * them into the RSC payload of a public page. A merchant's integration
 * credentials have no business there — even as nulls, the column names
 * describe what the shop is wired to, and a set value would ship to every
 * guest's browser.
 *
 * Kept as a list rather than a pattern so a new credential column is an
 * explicit decision here, not a regex accident.
 */
export const TENANT_SECRET_COLUMNS = [
  'convex_deploy_key',
  'lalamove_api_key',
  'lalamove_secret_key',
  'loyverse_access_token',
  'loyverse_webhook_error',
  'messenger_page_access_token',
  'supabase_order_anon_key',
  'supabase_order_service_key',
] as const

const SECRET_COLUMN_SET: ReadonlySet<string> = new Set(TENANT_SECRET_COLUMNS)

/**
 * A copy of the row without its credential columns. Null passes through.
 *
 * Typed as the row it was given: the consumers are storefront components
 * declared against `Tenant`, and none of them reads a credential. The columns
 * are absent at runtime, which is the point.
 */
export function omitTenantSecrets<T extends object | null>(tenant: T): T {
  if (tenant === null) return tenant
  const entries = Object.entries(tenant).filter(([key]) => !SECRET_COLUMN_SET.has(key))
  return Object.fromEntries(entries) as T
}
