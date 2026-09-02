import { createAdminClient } from '@/lib/supabase/admin'
import { toBusinessDayKey } from '@/lib/inventory/business-day'
import { buildPresellCalendar, type PresellCalendar } from '@/lib/presell/availability'

/**
 * One dish's presell calendar: remaining stock per upcoming date.
 *
 * Reads through the service-role client because `presell_stock` is
 * admin-only under RLS and a diner has no session. Only the remaining count
 * leaves this function — never the allocation or sold figures — and dates
 * before today (Asia/Manila business day) are dropped, so what the picker
 * shows is exactly what the checkout guard will accept.
 *
 * Throws on a read error: the route decides what an unreadable calendar
 * means (an empty one), and must not be able to mistake it for "no dates".
 */
export async function getPresellCalendar(
  tenantId: string,
  menuItemId: string,
  now: Date = new Date(),
): Promise<PresellCalendar> {
  const supabase = createAdminClient()
  const todayKey = toBusinessDayKey(now.toISOString())

  const { data, error } = await supabase
    .from('presell_stock')
    .select('menu_item_id, presell_date, stock_qty, sold_qty')
    .eq('tenant_id', tenantId)
    .eq('menu_item_id', menuItemId)
    .gte('presell_date', todayKey)
    .order('presell_date', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return buildPresellCalendar(data ?? [], todayKey)
}
