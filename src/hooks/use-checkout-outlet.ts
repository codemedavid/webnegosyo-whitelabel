'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchActiveOutlets } from '@/lib/outlets/outlets-client'
import { readOutletSelection } from '@/lib/outlets/outlet-selection'
import { readLinkedOutletSlug } from '@/lib/outlets/linked-outlet'
import { matchOutletByLinkSlug } from '@/lib/outlets/link-slug-match'
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
  /**
   * Whether `orderTypes` is the tenant's real list rather than the empty array
   * it starts as. The two are indistinguishable from the array alone, and the
   * difference matters: the order type is what narrows the branches, so
   * offering a list before it lands means offering branches that may be ruled
   * out a moment later. Defaults to true for callers with nothing to wait on.
   */
  areOrderTypesReady?: boolean
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
 * Under `after` there is no gate at all, which makes checkout the single place
 * the question is asked: branches are fetched, narrowed to the ones that can
 * fulfill the chosen order type, and a selection the order type has outgrown
 * is dropped rather than carried into an order that branch cannot serve.
 *
 * Under `before` the answer is supposed to already exist — the splash chooser
 * stored it — and when it does, this only reads it back and never touches the
 * network. But nothing guarantees it does: the stored choice expires, the
 * customer lands straight on checkout from a shared link, or a `/b/{slug}` QR
 * link satisfied the menu gate without ever writing the stored selection. In
 * every one of those cases the order used to be submitted against no branch at
 * all and surfaced as "Unassigned". So the obligation is now symmetric:
 * whenever a multi-branch tenant's checkout does not know the branch, it runs
 * the same fetch-narrow-ask pipeline the `after` timing always ran.
 *
 * A tenant without branches gets `null` and no fetch — exactly today's checkout.
 */
export function useCheckoutOutlet({
  tenant,
  tenantSlug,
  orderTypes,
  orderTypeId,
  areOrderTypesReady = true,
}: UseCheckoutOutletInput): UseCheckoutOutletResult {
  const isMultiBranch = isMultiBranchEnabled(tenant)
  const isAfterTiming = isMultiBranch && resolveOutletSelectionTiming(tenant) === 'after'

  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [hasLoadedOutlets, setHasLoadedOutlets] = useState(false)
  // `undefined` is "the customer has not answered", which is NOT the same as
  // `null`: clearing a choice is itself an answer, and has to bring the picker
  // back rather than fall through to the branch their QR link named.
  const [chosenOutletId, setChosenOutletId] = useState<string | null | undefined>(undefined)
  const [storedOutletId, setStoredOutletId] = useState<string | null>(null)
  // Storage cannot be read during render (it does not exist on the server), so
  // until this flips, "no stored choice" means "not looked yet" — a state that
  // must block the order rather than read as "nothing was chosen".
  const [isStorageHydrated, setIsStorageHydrated] = useState(false)
  const [linkedSlug, setLinkedSlug] = useState<string | null>(null)

  // The `before` path's answer. Read after mount because storage is not
  // available during render on the server.
  useEffect(() => {
    if (!isMultiBranch || typeof window === 'undefined') return
    if (!isAfterTiming) {
      setStoredOutletId(readOutletSelection(window.localStorage, tenantSlug, Date.now())?.outletId ?? null)
    }
    setIsStorageHydrated(true)
  }, [isAfterTiming, isMultiBranch, tenantSlug])

  // The branch a `/b/{slug}` link named, if the customer arrived through one.
  // Read after mount for the same reason as the stored selection above. Under
  // either timing: a QR arrival on a `before` tenant never wrote the stored
  // selection, and this is the only record of the branch the link named.
  useEffect(() => {
    if (!isMultiBranch || typeof window === 'undefined') return
    setLinkedSlug(readLinkedOutletSlug(window.localStorage, tenantSlug, Date.now()))
  }, [isMultiBranch, tenantSlug])

  // Whether checkout itself must resolve the branch: always under `after`, and
  // under `before` exactly when the splash's stored answer turned out missing.
  const needsCheckoutResolution =
    isMultiBranch && (isAfterTiming || (isStorageHydrated && storedOutletId === null))

  useEffect(() => {
    if (!needsCheckoutResolution || !tenant?.id) return
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
  }, [needsCheckoutResolution, tenant?.id])

  const mode = useMemo(
    () => resolveModeForOrderType(orderTypes, orderTypeId),
    [orderTypes, orderTypeId]
  )

  /**
   * The branch to resolve from: what the customer tapped, or — while they have
   * not answered — the one their link named.
   *
   * Matched by slug against the live list rather than trusted outright, and then
   * handed to `resolveCheckoutOutletSelection` like any other candidate, so a
   * branch that has since been deactivated or that cannot serve the chosen order
   * type is dropped and the picker comes back. A printed link is a suggestion,
   * not an instruction.
   */
  const candidateOutletId = useMemo(() => {
    if (chosenOutletId !== undefined) return chosenOutletId
    if (linkedSlug === null) return null
    return matchOutletByLinkSlug(outlets, linkedSlug)?.id ?? null
  }, [chosenOutletId, linkedSlug, outlets])

  const resolution = useMemo(
    () => resolveCheckoutOutletSelection({ outlets, mode, selectedOutletId: candidateOutletId }),
    [outlets, mode, candidateOutletId]
  )

  // Keeping the resolved id — not the raw click — as the source of truth is what
  // makes an outgrown selection disappear on an order-type change, and what
  // auto-picks the only branch that can serve the order.
  const resolvedOutletId = resolution.selectedOutletId

  const isPickerVisible = shouldPickOutletAtCheckout(tenant, outlets) && resolution.choices.length > 1

  // Both halves of the question have to be in hand: the branches themselves,
  // and the order type that decides which of them are eligible.
  const isLoading = needsCheckoutResolution && (!hasLoadedOutlets || !areOrderTypesReady)

  /**
   * Whether this order MUST name a branch before it can be placed.
   *
   * Deliberately not `isPickerVisible`. That answers "is there a list worth
   * showing", which is a different question and was the source of two ways to
   * place an order belonging to no branch at all: while the list was still
   * loading, and when the chosen order type left no branch able to serve it —
   * in both cases the picker stayed hidden and the CTA stayed live.
   *
   * The obligation follows the tenant, not the list — and not the timing. It
   * lifts in exactly one case: a tenant that opted in but has no active
   * branches yet, where holding the customer would strand them on a screen
   * with nothing to choose. That is a setup gap, and it degrades to today's
   * branchless checkout.
   */
  const isAwaitingStoredChoice = isMultiBranch && !isAfterTiming && !isStorageHydrated
  const isMissingRequiredSelection =
    isAwaitingStoredChoice ||
    (needsCheckoutResolution && (isLoading || (outlets.length > 0 && resolvedOutletId === null)))

  // The customer tapped a branch and no longer has it — only ever because the
  // order type changed under them, since nothing else clears a live choice.
  const droppedReason: CheckoutOutletDroppedReason | null =
    typeof chosenOutletId === 'string' && resolvedOutletId !== chosenOutletId
      ? 'order-type-changed'
      : null

  return {
    isPickerVisible,
    choices: resolution.choices,
    // Under `before` the splash's stored choice wins; the resolved id is the
    // fallback net's answer (QR link, auto-pick, or the checkout picker).
    selectedOutletId: isAfterTiming ? resolvedOutletId : (storedOutletId ?? resolvedOutletId),
    select: useCallback((outletId: string) => setChosenOutletId(outletId), []),
    clearSelection: useCallback(() => setChosenOutletId(null), []),
    mode,
    isLoading,
    droppedReason,
    isMissingRequiredSelection,
  }
}
