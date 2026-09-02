'use client'

import { useQuery } from '@tanstack/react-query'
import type { PresellCalendar } from '@/lib/presell/availability'
import { fetchPresellCalendar } from '@/lib/presell/calendar-client'

/**
 * One dish's presell calendar (remaining per upcoming date).
 *
 * Thin glue over `/api/presell/availability` — every decision it feeds lives
 * in `presell/availability.ts`, which is pure and tested. This only fetches.
 *
 * An empty map on any failure, by design — and for a presell dish an empty
 * map means NOTHING is sellable, which is the safe direction. Checkout stays
 * the authoritative refusal either way.
 */

const NO_CALENDAR: PresellCalendar = new Map()

/** Short, because a remainder is stale the moment the next order lands. */
const CALENDAR_STALE_MS = 30_000

export function usePresellAvailability(
  tenantId: string | null | undefined,
  menuItemId: string | null | undefined,
  enabled: boolean,
): { calendar: PresellCalendar; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['presell-availability', tenantId, menuItemId],
    queryFn: () => fetchPresellCalendar(tenantId as string, menuItemId as string),
    enabled: enabled && Boolean(tenantId) && Boolean(menuItemId),
    staleTime: CALENDAR_STALE_MS,
    retry: false,
  })

  return { calendar: data ?? NO_CALENDAR, isLoading: enabled && isLoading }
}
