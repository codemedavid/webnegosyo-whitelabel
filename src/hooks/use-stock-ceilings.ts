'use client'

import { useQuery } from '@tanstack/react-query'
import type { MenuStockCeilings, OptionStockCeilings } from '@/lib/inventory/menu-ceilings'
import { parseOptionCeilings } from '@/lib/inventory/option-availability'

/**
 * How many of each dish (and of each dish with each recipe-tracked option) the
 * kitchen can currently make.
 *
 * Thin glue over `/api/inventory/ceilings` — every decision it feeds lives in
 * `stepper-cap.ts` and `option-availability.ts`, which are pure and tested.
 * This only fetches.
 *
 * Empty maps on any failure, by design: a stepper that cannot load its cap
 * behaves exactly as it did before the cap existed, and checkout stays the
 * authoritative refusal either way. A menu that breaks because a stock read
 * hiccuped would be a far worse trade.
 */

interface StockCeilingsPayload {
  dishes: MenuStockCeilings
  options: OptionStockCeilings
}

const NO_CEILINGS: MenuStockCeilings = new Map()
const NO_OPTION_CEILINGS: OptionStockCeilings = new Map()
const NO_PAYLOAD: StockCeilingsPayload = { dishes: NO_CEILINGS, options: NO_OPTION_CEILINGS }

/** Short, because a ceiling is stale the moment the next order lands. */
const CEILING_STALE_MS = 30_000

async function fetchCeilings(
  tenantId: string,
  outletId: string | null,
): Promise<StockCeilingsPayload> {
  const params = new URLSearchParams({ tenantId })
  if (outletId) params.set('outletId', outletId)

  const response = await fetch(`/api/inventory/ceilings?${params}`)
  if (!response.ok) return NO_PAYLOAD

  const body = (await response.json()) as { ceilings?: Record<string, number>; optionCeilings?: unknown }
  return {
    dishes: new Map(Object.entries(body.ceilings ?? {})),
    options: parseOptionCeilings(body.optionCeilings),
  }
}

/** One fetch per tenant + branch; both hooks below read slices of it. */
function useCeilingsPayload<T>(
  tenantId: string | null | undefined,
  outletId: string | null,
  select: (payload: StockCeilingsPayload) => T,
) {
  return useQuery({
    queryKey: ['stock-ceilings', tenantId, outletId],
    queryFn: () => fetchCeilings(tenantId as string, outletId),
    enabled: Boolean(tenantId),
    staleTime: CEILING_STALE_MS,
    // A failed read means "no opinion", not "retry until the menu works".
    retry: false,
    select,
  }).data
}

const selectDishes = (payload: StockCeilingsPayload) => payload.dishes
const selectOptions = (payload: StockCeilingsPayload) => payload.options

export function useStockCeilings(
  tenantId: string | null | undefined,
  outletId: string | null = null,
): MenuStockCeilings {
  return useCeilingsPayload(tenantId, outletId, selectDishes) ?? NO_CEILINGS
}

/** Per dish, per recipe-tracked option: how many can be made with that option. */
export function useOptionStockCeilings(
  tenantId: string | null | undefined,
  outletId: string | null = null,
): OptionStockCeilings {
  return useCeilingsPayload(tenantId, outletId, selectOptions) ?? NO_OPTION_CEILINGS
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
