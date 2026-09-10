/**
 * The `tenantConfig` rows a tenant's Convex deployment reads.
 *
 * Convex is a separate database from Supabase: a store's Lalamove
 * credentials, market settings and pickup address only exist there because
 * something pushed them across. `convex-config-sync.ts` does the pushing;
 * this module decides what is pushed, and is kept pure so the mapping can be
 * tested without a deployment.
 *
 * Every key the deployment reads is emitted on every sync, including empty
 * ones. An omitted key leaves whatever Convex already holds, which is how a
 * store with live production keys in Supabase kept booking against a stale
 * placeholder from an earlier deploy.
 */

export interface ConvexTenantConfigSource {
  id?: string | null
  name?: string | null
  convex_auth_enforced?: boolean | null
  convex_public_reads?: boolean | null
  lalamove_enabled?: boolean | null
  lalamove_api_key?: string | null
  lalamove_secret_key?: string | null
  lalamove_market?: string | null
  lalamove_service_type?: string | null
  lalamove_sandbox?: boolean | null
  lalamove_sender_phone?: string | null
  footer_phone?: string | null
  footer_whatsapp?: string | null
  restaurant_address?: string | null
  restaurant_latitude?: string | number | null
  restaurant_longitude?: string | number | null
}

/**
 * The tenant columns a config sync needs. The credentials are NOT here — they
 * live in `tenant_secrets` and are merged in by the sync module.
 */
export const CONVEX_CONFIG_TENANT_COLUMNS =
  'id, name, convex_deployment_url, convex_auth_enforced, convex_public_reads, ' +
  'lalamove_enabled, lalamove_market, ' +
  'lalamove_service_type, lalamove_sandbox, lalamove_sender_phone, footer_phone, ' +
  'footer_whatsapp, restaurant_address, restaurant_latitude, restaurant_longitude'

const DEFAULT_MARKET = 'PH'
const DEFAULT_SERVICE_TYPE = 'MOTORCYCLE'

function text(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * The number the rider calls at pickup — the store's, never the customer's.
 * `||` rather than `??`: a merchant who cleared the field leaves `''` behind,
 * and `''` must fall through to the footer numbers.
 */
function senderPhone(source: ConvexTenantConfigSource): string {
  return text(source.lalamove_sender_phone) || text(source.footer_phone) || text(source.footer_whatsapp)
}

/**
 * Build the full set of config rows for a tenant. Values are strings because
 * `tenantConfig.value` is a string column in the Convex schema.
 */
export function buildTenantConfigPayload(
  source: ConvexTenantConfigSource
): Record<string, string> {
  const isLalamoveOn = Boolean(source.lalamove_enabled)

  return {
    // Which store this deployment is. The merchant gate (template v28+)
    // admits a caller whose platform JWT names this tenant; a deployment
    // never synced with it refuses everyone but a superadmin.
    tenant_id: text(source.id),
    // Rollout switches — see the migration that added the columns.
    auth_enforced: String(Boolean(source.convex_auth_enforced)),
    public_reads: String(Boolean(source.convex_public_reads)),
    // Store identity: the Lalamove sender name and the pickup label.
    restaurant_name: text(source.name),
    restaurant_address: text(source.restaurant_address),
    restaurant_latitude: text(source.restaurant_latitude),
    restaurant_longitude: text(source.restaurant_longitude),
    // Credentials are blanked when Lalamove is switched off, so a store that
    // was turned off cannot keep booking on the keys of its last sync.
    lalamove_api_key: isLalamoveOn ? text(source.lalamove_api_key) : '',
    lalamove_secret_key: isLalamoveOn ? text(source.lalamove_secret_key) : '',
    lalamove_market: text(source.lalamove_market) || DEFAULT_MARKET,
    lalamove_service_type: text(source.lalamove_service_type) || DEFAULT_SERVICE_TYPE,
    lalamove_sandbox: String(Boolean(source.lalamove_sandbox)),
    lalamove_sender_phone: senderPhone(source),
  }
}
