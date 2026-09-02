import type { PresellCalendar } from '@/lib/presell/availability'

const NO_CALENDAR: PresellCalendar = new Map()

/**
 * Browser-side read of one dish's presell calendar. An empty map on any
 * failure — for a presell dish that is the safe direction (nothing sellable),
 * and checkout remains the authoritative refusal.
 */
export async function fetchPresellCalendar(tenantId: string, menuItemId: string): Promise<PresellCalendar> {
  const params = new URLSearchParams({ tenantId, menuItemId })
  const response = await fetch(`/api/presell/availability?${params}`)
  if (!response.ok) return NO_CALENDAR

  const body = (await response.json()) as { calendar?: Record<string, number> }
  return new Map(Object.entries(body.calendar ?? {}))
}
