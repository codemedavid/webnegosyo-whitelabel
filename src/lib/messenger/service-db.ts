import 'server-only'
import { createAdminClient, type AdminClient } from '@/lib/supabase/admin'

/**
 * The ONE place Messenger code takes the service role (it bypasses row-level
 * security). Why it is needed here:
 * - the webhook and the order-update hook run with no signed-in user (Meta and
 *   pg_net call them), so there is no session client to use;
 * - `messenger_sessions` (cart, checkout state, tester PSID), `messenger_messages`
 *   writes and `messenger_order_updates` are service-role-only tables by design.
 * Every caller scopes its reads and writes to one store (`tenant_id`) itself.
 * Staff screens (Messenger Studio) check the caller's `settings` permission
 * before they get here. Never hand this client to the browser.
 */
export function messengerDb(): AdminClient {
  return createAdminClient()
}
