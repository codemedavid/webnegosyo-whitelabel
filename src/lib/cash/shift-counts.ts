/**
 * How many counts each shift has (CONTRACTS W2.1 `shift_counts`, append-only,
 * attempt 1 or 2): "Recounted" on the Shifts table. Read through the caller's
 * session (RLS decides). ADVISORY: a failed read returns null ("not known"),
 * and the table still opens.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** PostgREST keeps `in (…)` lists short; a business day has far fewer shifts than this. */
const IDS_PER_READ = 100

export async function readCountAttempts(db: SupabaseClient, shiftIds: readonly string[]): Promise<Map<string, number> | null> {
  if (shiftIds.length === 0) return new Map()
  try {
    const chunks = Array.from({ length: Math.ceil(shiftIds.length / IDS_PER_READ) }, (_, index) =>
      shiftIds.slice(index * IDS_PER_READ, (index + 1) * IDS_PER_READ),
    )
    const answers = await Promise.all(
      chunks.map((ids) => db.from('shift_counts').select('shift_id, attempt').in('shift_id', ids).limit(ids.length * 2)),
    )
    const attempts = new Map<string, number>()
    for (const { data, error } of answers) {
      if (error) throw new Error(error.message)
      for (const row of (data ?? []) as Array<{ shift_id: string; attempt: number }>) {
        attempts.set(row.shift_id, Math.max(attempts.get(row.shift_id) ?? 0, row.attempt))
      }
    }
    return attempts
  } catch (error) {
    console.error('[cash] shift counts unavailable', error instanceof Error ? error.message : error)
    return null
  }
}
