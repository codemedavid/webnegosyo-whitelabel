/**
 * The name an expense is filed under (`created_by_name`, `recorded_by_name`).
 *
 * The staff account's own display name, else its email, else the auth email —
 * read with the caller's session (everyone can read their own `app_users` row).
 * A failed read never blocks a write: the name is a snapshot for people, the
 * `created_by` uuid the database stamps is the record.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { ExpenseActor } from './expense-service'

export async function resolveExpenseActor(db: SupabaseClient, user: Pick<User, 'id' | 'email'>): Promise<ExpenseActor> {
  const { data, error } = await db.from('app_users').select('display_name, email').eq('user_id', user.id).maybeSingle()
  if (error) console.error('[expenses] actor name read failed', { code: error.code ?? null })
  const row = (data ?? null) as { display_name?: string | null; email?: string | null } | null
  return { displayName: row?.display_name || row?.email || user.email || 'Staff' }
}
