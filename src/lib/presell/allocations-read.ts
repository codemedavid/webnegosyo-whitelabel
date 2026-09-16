import { createAdminClient } from '@/lib/supabase/admin'
import type { PresellStock } from '@/types/database'

/**
 * Every allocation the merchant's panel shows for one dish, soonest first.
 *
 * Split out of the server action so the edit page can fetch it alongside its
 * other queries and hand the panel its first render already populated — the
 * panel used to mount empty and then pay a second round trip of its own,
 * which is the waterfall the merchant saw as "it takes a while to load".
 *
 * Unlike `getPresellCalendar`, sold counts come through: the panel is the one
 * surface allowed to see what a date has already promised. Past dates come
 * through too but bounded, so a merchant who has run presell daily for a year
 * is not shipped 365 dead rows on every open.
 *
 * Throws on a read error. The caller decides what an unreadable panel means;
 * it must never be mistaken for "no dates offered".
 */

/** How far back the panel's "Past dates" disclosure can look. */
export const PAST_ALLOCATION_WINDOW_DAYS = 30

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** The earliest date the panel reads, as a YYYY-MM-DD business-day key. */
export function earliestAllocationKey(
  todayKey: string,
  windowDays: number = PAST_ALLOCATION_WINDOW_DAYS,
): string {
  const [year, month, day] = todayKey.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, day) - windowDays * MS_PER_DAY)
  return start.toISOString().slice(0, 10)
}

export async function getPresellAllocations(
  tenantId: string,
  menuItemId: string,
  todayKey: string,
): Promise<PresellStock[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('presell_stock')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('menu_item_id', menuItemId)
    .gte('presell_date', earliestAllocationKey(todayKey))
    .order('presell_date', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []) as PresellStock[]
}
