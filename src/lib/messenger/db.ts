import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * `messenger_rules`, `messenger_settings` and the new `messenger_sessions`
 * columns (20261110120000) are not in the generated database types until the
 * migration is applied and the types are regenerated through the Supabase MCP.
 * Until then the messenger modules reach those tables through this untyped
 * view of the SAME client (same role, same RLS). Delete it after regenerating.
 */
export function withMessengerTables(client: unknown): SupabaseClient {
  return client as SupabaseClient
}
