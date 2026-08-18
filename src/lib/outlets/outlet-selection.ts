/**
 * What the storefront should do about branches, decided in one pure place.
 *
 * Persistence and the decision live together because they answer one question
 * between them: given the flag, the tenant's branches, the customer's last
 * choice and the URL, do we show the menu or ask first? Keeping it out of the
 * components is what makes the awkward states testable — a stored branch the
 * merchant has since switched off, a delivery choice at a branch that stopped
 * delivering, or a picker offered to a merchant with one shop.
 */

import { matchOutletByLinkSlug } from '@/lib/outlets/link-slug-match'
import type { OutletOrderMode } from '@/lib/outlets/nearest-outlet'

export const OUTLET_SELECTION_KEY_PREFIX = 'selected_outlet_'

/** Long enough to survive a lunch break and a return visit the same week. */
export const OUTLET_SELECTION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** The branch fields the storefront flow needs. */
export interface SelectableOutlet {
  id: string
  slug: string
  name: string
  latitude: number | null
  longitude: number | null
  delivery_radius_km: number | null
  supports_pickup: boolean
  supports_delivery: boolean
  /** Optional so pre-dine-in callers and fixtures keep compiling; absent = false. */
  supports_dine_in?: boolean
  is_active: boolean
  sort_order: number
}

export interface StoredOutletSelection {
  outletId: string
  /**
   * Null when the customer entered through the welcome page's single CTA,
   * which goes straight to the branch list — the order type is asked at
   * checkout instead, exactly as the 'after' timing does.
   */
  mode: OutletOrderMode | null
}

/** The `Storage` surface this module uses; injectable so tests need no DOM. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const storageKey = (tenantSlug: string): string => `${OUTLET_SELECTION_KEY_PREFIX}${tenantSlug}`

const isMode = (value: unknown): value is OutletOrderMode =>
  value === 'pickup' || value === 'delivery' || value === 'dine_in'

/**
 * Read the stored selection, dropping it if it is expired, corrupt, or of a
 * shape this version does not recognise. Storage access is wrapped because
 * Safari's private mode throws on it, and a storefront must not break over
 * where we cached a preference.
 */
export function readOutletSelection(
  storage: StorageLike,
  tenantSlug: string,
  now: number
): StoredOutletSelection | null {
  let raw: string | null
  try {
    raw = storage.getItem(storageKey(tenantSlug))
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { outletId, mode, savedAt } = parsed as Record<string, unknown>
    // Mode null is a real selection (single-CTA entry); garbage is not.
    if (
      typeof outletId !== 'string' ||
      (mode !== null && !isMode(mode)) ||
      typeof savedAt !== 'number'
    ) {
      return null
    }

    if (now - savedAt > OUTLET_SELECTION_TTL_MS) {
      clearOutletSelection(storage, tenantSlug)
      return null
    }

    return { outletId, mode }
  } catch {
    clearOutletSelection(storage, tenantSlug)
    return null
  }
}

export function writeOutletSelection(
  storage: StorageLike,
  tenantSlug: string,
  selection: StoredOutletSelection,
  now: number
): void {
  try {
    storage.setItem(storageKey(tenantSlug), JSON.stringify({ ...selection, savedAt: now }))
  } catch {
    // A customer who cannot persist their choice is asked again next visit.
    // That is a worse experience, not a broken one.
  }
}

export function clearOutletSelection(storage: StorageLike, tenantSlug: string): void {
  try {
    storage.removeItem(storageKey(tenantSlug))
  } catch {
    // See writeOutletSelection.
  }
}

/** Why the customer is being asked to choose. */
export type OutletPromptReason =
  | 'no-selection'
  | 'unknown-link'
  | 'outlet-unavailable'
  | 'mode-unsupported'

export interface OutletSelectionInput {
  isEnabled: boolean
  outlets: readonly SelectableOutlet[]
  stored: StoredOutletSelection | null
  urlSlug: string | null
  hasCartItems?: boolean
}

export interface OutletSelectionResult {
  /** The branch to serve, or null when the customer must choose first. */
  outlet: SelectableOutlet | null
  mode: OutletOrderMode | null
  shouldPrompt: boolean
  reason: OutletPromptReason | null
  /** Active branches in merchant order — what the picker renders. */
  choices: SelectableOutlet[]
  /** The stored selection is stale and should be removed. */
  shouldClearStorage: boolean
  /** The branch is changing while the cart has items in it. */
  requiresCartConfirmation: boolean
}

const EMPTY: Omit<OutletSelectionResult, 'shouldClearStorage'> = {
  outlet: null,
  mode: null,
  shouldPrompt: false,
  reason: null,
  choices: [],
  requiresCartConfirmation: false,
}

const supportsMode = (outlet: SelectableOutlet, mode: OutletOrderMode): boolean => {
  if (mode === 'dine_in') return outlet.supports_dine_in === true
  if (mode === 'pickup') return outlet.supports_pickup
  return outlet.supports_delivery
}

export function resolveOutletSelection(input: OutletSelectionInput): OutletSelectionResult {
  const { isEnabled, outlets, stored, urlSlug, hasCartItems = false } = input

  // Flag off: the storefront behaves exactly as it does today, and any
  // selection left over from when it was on is dropped.
  if (!isEnabled) {
    return { ...EMPTY, shouldClearStorage: stored !== null }
  }

  const choices = outlets
    .filter((outlet) => outlet.is_active)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  // Zero or one branch is not a choice — skip the flow entirely, exactly as a
  // single-location tenant behaves today.
  if (choices.length === 0) {
    return { ...EMPTY, shouldClearStorage: stored !== null }
  }
  if (choices.length === 1) {
    return { ...EMPTY, outlet: choices[0], choices, shouldClearStorage: false }
  }

  const previousOutletId = stored?.outletId ?? null
  const confirmSwitch = (nextOutletId: string): boolean =>
    hasCartItems && previousOutletId !== null && previousOutletId !== nextOutletId

  // The URL wins over anything stored. Matched through `matchOutletByLinkSlug`
  // rather than compared outright, so a link naming only the distinctive part
  // of a slug still resolves — and an ambiguous one still asks.
  if (urlSlug !== null && urlSlug.trim() !== '') {
    const linked = matchOutletByLinkSlug(choices, urlSlug)

    if (!linked) {
      // A dead or mistyped link falls back to the picker rather than erroring.
      return {
        ...EMPTY,
        shouldPrompt: true,
        reason: 'unknown-link',
        choices,
        shouldClearStorage: false,
      }
    }

    return {
      outlet: linked,
      mode: stored?.mode ?? null,
      shouldPrompt: false,
      reason: null,
      choices,
      shouldClearStorage: false,
      requiresCartConfirmation: confirmSwitch(linked.id),
    }
  }

  if (!stored) {
    return {
      ...EMPTY,
      shouldPrompt: true,
      reason: 'no-selection',
      choices,
      shouldClearStorage: false,
    }
  }

  const remembered = choices.find((outlet) => outlet.id === stored.outletId)
  if (!remembered) {
    // Deleted or switched off since the customer last visited.
    return {
      ...EMPTY,
      shouldPrompt: true,
      reason: 'outlet-unavailable',
      choices,
      shouldClearStorage: true,
    }
  }

  if (stored.mode !== null && !supportsMode(remembered, stored.mode)) {
    // The branch stopped offering what they picked; asking again is the only
    // way to avoid an order type the branch cannot fulfill.
    return {
      ...EMPTY,
      shouldPrompt: true,
      reason: 'mode-unsupported',
      choices,
      shouldClearStorage: true,
    }
  }

  return {
    outlet: remembered,
    mode: stored.mode,
    shouldPrompt: false,
    reason: null,
    choices,
    shouldClearStorage: false,
    requiresCartConfirmation: false,
  }
}
