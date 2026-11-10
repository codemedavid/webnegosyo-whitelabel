/**
 * TEMPORARY: the service-role client without generated types, for the release 2
 * objects (`messenger_sessions.cart_version`, `messenger_order_updates`) until
 * 20261111090000 is applied and `src/types/supabase.ts` is regenerated. Delete
 * this file and use `createAdminClient()` then.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export function untypedAdminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}
