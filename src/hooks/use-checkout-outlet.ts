'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchActiveOutlets } from '@/lib/outlets/outlets-client'
import { readOutletSelection } from '@/lib/outlets/outlet-selection'
import { resolveModeForOrderType } from '@/lib/outlets/mode-order-type'
import { resolveCheckoutOutletSelection } from '@/lib/outlets/checkout-outlet'
import {
  isMultiBranchEnabled,
  resolveOutletSelectionTiming,
  shouldPickOutletAtCheckout,
} from '@/lib/outlets/selection-timing'
import type { OutletOrderMode, RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { OrderType, Outlet, Tenant } from '@/types/database'

interface UseCheckoutOutletInput {
  tenant: Tenant | null
  tenantSlug: string
  orderTypes: readonly OrderType[]
  orderTypeId: string | null
}

/** Why a branch the customer had already chosen is no longer chosen. */
export type CheckoutOutletDroppedReason = 'order-type-changed'

export interface UseCheckoutOutletResult {
  /** Whether checkout should render the branch picker at all. */
  isPickerVisible: boolean
  /** Branches that can fulfill the chosen order type, in the merchant's order. */
  choices: RankedOutlet<Outlet>[]
  /** The branch this order will be attributed to, under either timing. */
  selectedOutletId: string | null
  select: (outletId: string) => void
  /** Drops the current choice, which brings the branch screen back. */
  clearSelection: () => void
  /** The order type's mode, for labelling the screen. Null for custom types. */
  mode: OutletOrderMode | null
  /** True until the branch list has been read. Nothing may be concluded yet. */
  isLoading: boolean
  /** Set when the customer's own choice was taken away, so it can be explained. */
  droppedReason: CheckoutOutletDroppedReason | null
  /** True when the customer must answer before the order can be placed. */
  isMissingRequiredSelection: boolean
}

/**
 * Which branch takes this order, resolved for both timings.
 *
 * Under `before` the answer already exists — the splash chooser stored it — so
 * this only reads it back and never touches the network. Under `after` there is
 * no gate at all, which makes checkout the single place the question is asked:
 * branches are fetched, narrowed to the ones that can fulfill the chosen order
 * type, and a selection the order type has outgrown is dropped rather than
 * carried into an order that branch cannot serve.
 *
 * A tenant without branches gets `null` and no fetch — exactly today's checkout.
 */
export function useCheckoutOutlet({
  tenant,
  tenantSlug,
  orderTypes,
  orderTypeId,
}: UseCheckoutOutletInput): UseCheckoutOutletResult {
  const isAfterTiming = isMultiBranchEnabled(tenant) && resolveOutletSelectionTiming(tenant) === 'after'

  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [hasLoadedOutlets, setHasLoadedOutlets] = useState(false)
  const [chosenOutletId, setChosenOutletId] = useState<string | null>(null)
  const [storedOutletId, setStoredOutletId] = useState<string | null>(null)

  // The `before` path's answer. Read after mount because storage is not
  // available during render on the server.
  useEffect(() => {
    if (isAfterTiming || !isMultiBranchEnabled(tenant) || typeof window === 'undefined') return
    setStoredOutletId(readOutletSelection(window.localStorage, tenantSlug, Date.now())?.outletId ?? null)
  }, [isAfterTiming, tenant, tenantSlug])

  useEffect(() => {
    if (!isAfterTiming || !tenant?.id) return
    let isCurrent = true

    fetchActiveOutlets(tenant.id).then((rows) => {
      if (!isCurrent) return
      setOutlets(rows)
      // Set last and unconditionally: a failed read resolves to [], and the
      // customer must still be let through rather than held on a blank screen.
      setHasLoadedOutlets(true)
    })

    return () => {
      isCurrent = false
    }
  }, [isAfterTiming, tenant?.id])

  const mode = useMemo(
    () => resolveModeForOrderType(orderTypes, orderTypeId),
    [orderTypes, orderTypeId]
  )

  const resolution = useMemo(
    () => resolveCheckoutOutletSelection({ outlets, mode, selectedOutletId: chosenOutletId }),
    [outlets, mode, chosenOutletId]
  )

  // Keeping the resolved id — not the raw click — as the source of truth is what
  // makes an outgrown selection disappear on an order-type change, and what
  // auto-picks the only branch that can serve the order.
  const resolvedOutletId = resolution.selectedOutletId

  const isPickerVisible = shouldPickOutletAtCheckout(tenant, outlets) && resolution.choices.length > 1

  const isLoading = isAfterTiming && !hasLoadedOutlets

  /**
   * Whether this order MUST name a branch before it can be placed.
   *
   * Deliberately not `isPickerVisible`. That answers "is there a list worth
   * showing", which is a different question and was the source of two ways to
   * place an order belonging to no branch at all: while the list was still
   * loading, and when the chosen order type left no branch able to serve it —
   * in both cases the picker stayed hidden and the CTA stayed live.
   *
   * The obligation follows the tenant, not the list. It lifts in exactly one
   * case: a tenant that opted in but has no active branches yet, where holding
   * the customer would strand them on a screen with nothing to choose. That is
   * a setup gap, and it degrades to today's branchless checkout.
   */
  const isMissingRequiredSelection =
    isAfterTiming && (isLoading || (outlets.length > 0 && resolvedOutletId === null))

  // The customer tapped a branch and no longer has it — only ever because the
  // order type changed under them, since nothing else clears a live choice.
  const droppedReason: CheckoutOutletDroppedReason | null =
    chosenOutletId !== null && resolvedOutletId !== chosenOutletId ? 'order-type-changed' : null

  return {
    isPickerVisible,
    choices: resolution.choices,
    selectedOutletId: isAfterTiming ? resolvedOutletId : storedOutletId,
    select: useCallback((outletId: string) => setChosenOutletId(outletId), []),
    clearSelection: useCallback(() => setChosenOutletId(null), []),
    mode,
    isLoading,
    droppedReason,
    isMissingRequiredSelection,
  }
}
