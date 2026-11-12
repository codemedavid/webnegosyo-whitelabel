import 'server-only'
import { ADMIN_QUERY_TIMEOUT_MS, createAdminClient, type AdminClient, type AdminClientOptions } from '@/lib/supabase/admin'

/**
 * The ONE place the customer app's server code (`/api/app/v1/*`, customer
 * sign-in, app push) takes the service role, which bypasses row-level
 * security. Why it is needed here: an app customer is not a Supabase Auth user
 * (they hold an opaque `cs1.` session from `src/lib/customer-auth/`), so there
 * is no session client to read or write as, and `tenant_apps`,
 * `customer_accounts`, `customer_app_orders` and the push-token tables are
 * service-role-only by design.
 *
 * Every caller has already resolved the store from `X-App-Id` (`tenant-app.ts`)
 * and, where a customer is involved, verified their session; each read and
 * write is scoped to that store (and customer) by the caller.
 *
 * Default: the request-path budget (`ADMIN_QUERY_TIMEOUT_MS`). Pass `{}` for no
 * timeout.
 */
export function appDb(options: AdminClientOptions = { timeoutMs: ADMIN_QUERY_TIMEOUT_MS }): AdminClient {
  return createAdminClient(options)
}
