/**
 * The signed-in admin's row, including the branch it is confined to.
 *
 * Every web-admin action funnels through this read, which makes its projection
 * the most dangerous one in the app: PostgREST rejects the *whole* query when a
 * single projected column is missing, so naming `outlet_id` before its
 * migration is applied would 400 the entire admin rather than one feature.
 * That is the failure `fetch-tenant-by-slug.ts` documents, and the window is
 * unavoidable — code is deployed before a migration is applied, if only for a
 * moment.
 *
 * So the branch column is asked for, and on an undefined-column error the read
 * is repeated with the projection that existed before branches. The account
 * then reads as store-wide, which is exactly what every account meant then.
 */

/** PostgREST surfaces Postgres `undefined_column` as SQLSTATE 42703. */
const UNDEFINED_COLUMN_CODE = '42703'

export const APP_USER_LEGACY_SELECT = 'role, tenant_id, is_owner, permissions'
export const APP_USER_SCOPE_SELECT = `${APP_USER_LEGACY_SELECT}, outlet_id`
/**
 * Adds the platform-staff grants. Its own tier, tried first, so a missing
 * `platform_permissions` column falls back to the branch-aware read instead of
 * dropping every admin to the pre-branch one.
 */
export const APP_USER_PLATFORM_SELECT = `${APP_USER_SCOPE_SELECT}, platform_permissions`

/** Tried in order; each step drops the newest column on an undefined-column error. */
const PROJECTION_TIERS = [APP_USER_PLATFORM_SELECT, APP_USER_SCOPE_SELECT, APP_USER_LEGACY_SELECT] as const

export interface AppUserScopeRow {
  role: string
  tenant_id: string | null
  is_owner?: boolean | null
  permissions?: string[] | null
  /** Absent when the row was read through the pre-branch fallback. */
  outlet_id?: string | null
  /** platform_staff grants (`section.action`); absent before its migration. */
  platform_permissions?: string[] | null
}

interface QueryError {
  code?: string
  message: string
}

interface AppUserQueryBuilder {
  eq: (column: string, value: unknown) => {
    maybeSingle: () => PromiseLike<{ data: unknown; error: QueryError | null }>
  }
}

/**
 * Structural subset of the Supabase client this helper needs, declared locally
 * so the module stays unit-testable with a fake and free of server-only
 * imports — the same arrangement `TenantQueryClient` uses.
 */
export interface AppUserQueryClient {
  from: (table: string) => { select: (projection: string) => AppUserQueryBuilder }
}

/** Narrow a generated Supabase client to the subset this helper uses. */
export function asAppUserQueryClient(client: unknown): AppUserQueryClient {
  return client as AppUserQueryClient
}

export interface AppUserScopeResult {
  /** The row, or null when the user has no admin record / the query failed. */
  appUser: AppUserScopeRow | null
  /** True when the row came from the pre-branch fallback projection. */
  isDegraded: boolean
  /** Non-null only for real failures — an absent row is not an error. */
  error: string | null
}

function queryAppUser(client: AppUserQueryClient, userId: string, projection: string) {
  return client.from('app_users').select(projection).eq('user_id', userId).maybeSingle()
}

export async function fetchAppUserScope(
  client: AppUserQueryClient,
  userId: string
): Promise<AppUserScopeResult> {
  for (const projection of PROJECTION_TIERS) {
    const { data, error } = await queryAppUser(client, userId, projection)

    if (!error) {
      return {
        appUser: (data as AppUserScopeRow | null) ?? null,
        // Only the pre-branch read loses information that changes access.
        isDegraded: projection === APP_USER_LEGACY_SELECT,
        error: null,
      }
    }

    if (error.code !== UNDEFINED_COLUMN_CODE || projection === APP_USER_LEGACY_SELECT) {
      return { appUser: null, isDegraded: false, error: error.message }
    }

    console.error(
      `[fetch-app-user-scope] app_users projection "${projection}" rejected — a column is missing from the database (likely an unapplied migration). Retrying with an older projection. Original error: ${error.message}`
    )
  }

  return { appUser: null, isDegraded: false, error: 'app_users read exhausted every projection' }
}
