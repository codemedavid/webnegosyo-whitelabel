'use client'

import { useCallback, useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { CartItem } from '@/types/database'
import { countPresellInCart, describePresellRemaining, type PresellCalendar } from '@/lib/presell/availability'
import { fetchPresellCalendar } from '@/lib/presell/calendar-client'

const NO_CALENDAR: PresellCalendar = new Map()
const CALENDAR_STALE_MS = 30_000

/**
 * The cart page's "+" button, told where each presell date's stock ends.
 *
 * One calendar read per presell dish in the cart; ordinary lines are
 * untouched (`canIncreaseItem` is true for them, exactly as before). Unlike
 * ingredient ceilings, an unreadable calendar caps the line at what it holds
 * rather than uncapping it — for presell, "no calendar" means "no stock".
 */
export function usePresellCartCaps(tenantId: string | null | undefined, items: CartItem[]) {
  const presellItemIds = useMemo(
    () => [...new Set(items.filter((i) => i.presell_date).map((i) => i.menu_item.id))],
    [items],
  )

  const reads = useQueries({
    queries: presellItemIds.map((menuItemId) => ({
      queryKey: ['presell-availability', tenantId, menuItemId],
      queryFn: () => fetchPresellCalendar(tenantId as string, menuItemId),
      enabled: Boolean(tenantId),
      staleTime: CALENDAR_STALE_MS,
      retry: false,
    })),
  })

  const calendars = useMemo(() => {
    const map = new Map<string, PresellCalendar>()
    presellItemIds.forEach((id, index) => map.set(id, reads[index]?.data ?? NO_CALENDAR))
    return map
  }, [presellItemIds, reads])

  const remainingFor = useCallback(
    (item: CartItem): number | null => {
      if (!item.presell_date) return null
      return calendars.get(item.menu_item.id)?.get(item.presell_date) ?? 0
    },
    [calendars],
  )

  const canIncreaseItem = useCallback(
    (item: CartItem): boolean => {
      const remaining = remainingFor(item)
      if (remaining === null) return true
      return countPresellInCart(items, item.menu_item.id, item.presell_date as string) < remaining
    },
    [remainingFor, items],
  )

  const presellHintFor = useCallback(
    (item: CartItem): string | null => {
      const remaining = remainingFor(item)
      if (remaining === null) return null
      return describePresellRemaining(remaining, countPresellInCart(items, item.menu_item.id, item.presell_date as string))
    },
    [remainingFor, items],
  )

  return { canIncreaseItem, presellHintFor }
}
