/**
 * The name a ledger row is signed with: the staff member's display name on
 * this store, else their email. Read with the service role from the verified
 * user id — never from a request body.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { LedgerActor } from './record-service'

export async function resolveLedgerActor(
  db: SupabaseClient<Database>,
  tenantId: string,
  user: User,
): Promise<LedgerActor & { userId: string }> {
  const { data } = await db
    .from('app_users')
    .select('display_name')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const name = data?.display_name?.trim() || user.email || 'Staff'
  return { userId: user.id, name }
}
