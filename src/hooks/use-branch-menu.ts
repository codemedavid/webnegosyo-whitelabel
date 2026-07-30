'use client'

import { useMemo } from 'react'
import {
  buildOutletMenuIndex,
  findOutletMenuOverride,
  resolveItemForOutlet,
  resolveMenuForOutlet,
  type OutletMenuOverrideRow,
  type OverridableMenuItem,
} from '@/lib/outlets/outlet-menu-overrides'

/**
 * The menu as the selected branch sells it.
 *
 * The branch is chosen in the browser — from storage, the `?outlet=` param, or
 * the gate — while the menu page is server-rendered and cached by ISR for five
 * minutes and shared by every branch. So the overrides travel down as data and
 * the branch is applied here, at one seam, rather than by fetching a different
 * menu per branch and giving up the cache.
 *
 * A null branch returns the store-wide menu untouched: that is the
 * single-location tenant, and the multi-branch tenant who moved the question to
 * checkout (`outlet_selection_timing = 'after'`).
 */
export function useBranchMenu<T extends OverridableMenuItem>({
  items,
  overrides,
  selectedOutletId,
}: {
  items: readonly T[]
  /** Every override the tenant has. Undefined when the query failed or never ran. */
  overrides: readonly OutletMenuOverrideRow[] | null | undefined
  selectedOutletId: string | null | undefined
}) {
  const index = useMemo(() => buildOutletMenuIndex(overrides), [overrides])

  const resolvedItems = useMemo(
    () => resolveMenuForOutlet(items, index, selectedOutletId),
    [items, index, selectedOutletId]
  )

  /**
   * One dish, for the paths that hold an item rather than the list — the
   * product detail page, the cart's refresh, an upsell suggestion. Returns the
   * item unchanged when the branch has no opinion, so callers need no branch.
   */
  const resolveItem = useMemo(
    () =>
      <I extends OverridableMenuItem>(item: I): I =>
        resolveItemForOutlet(
          item,
          findOutletMenuOverride(index, selectedOutletId ?? null, item.id)
        ),
    [index, selectedOutletId]
  )

  return { items: resolvedItems, resolveItem, index }
}
