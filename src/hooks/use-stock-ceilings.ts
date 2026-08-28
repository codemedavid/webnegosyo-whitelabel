'use client'

import { useQuery } from '@tanstack/react-query'
import type { MenuStockCeilings } from '@/lib/inventory/menu-ceilings'

/**
 * How many of each dish the kitchen can currently make.
 *
 * Thin glue over `/api/inventory/ceilings` — every decision it feeds lives in
 * `stepper-cap.ts`, which is pure and tested. This only fetches.
 *
 * An empty map on any failure, by design: a stepper that cannot load its cap
 * behaves exactly as it did before the cap existed, and checkout stays the
 * authoritative refusal either way. A menu that breaks because a stock read
 * hiccuped would be a far worse trade.
 */

const NO_CEILINGS: MenuStockCeilings = new Map()

/** Short, because a ceiling is stale the moment the next order lands. */
const CEILING_STALE_MS = 30_000

async function fetchCeilings(
  tenantId: string,
  outletId: string | null,
): Promise<MenuStockCeilings> {
  const params = new URLSearchParams({ tenantId })
  if (outletId) params.set('outletId', outletId)

  const response = await fetch(`/api/inventory/ceilings?${params}`)
  if (!response.ok) return NO_CEILINGS

  const body = (await response.json()) as { ceilings?: Record<string, number> }
  return new Map(Object.entries(body.ceilings ?? {}))
}

export function useStockCeilings(
  tenantId: string | null | undefined,
  outletId: string | null = null,
): MenuStockCeilings {
  const { data } = useQuery({
    queryKey: ['stock-ceilings', tenantId, outletId],
    queryFn: () => fetchCeilings(tenantId as string, outletId),
    enabled: Boolean(tenantId),
    staleTime: CEILING_STALE_MS,
    // A failed read means "no opinion", not "retry until the menu works".
    retry: false,
  })

  return data ?? NO_CEILINGS
}

/**
 * One dish's ceiling. `null` — the shape `resolveAddableQuantity` reads as
 * unlimited — for anything untracked, which is most of most menus.
 */
export function selectCeiling(
  ceilings: MenuStockCeilings,
  menuItemId: string,
): number | null {
  return ceilings.get(menuItemId) ?? null
}
