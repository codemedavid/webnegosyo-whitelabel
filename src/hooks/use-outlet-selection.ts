'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  clearOutletSelection,
  readOutletSelection,
  resolveOutletSelection,
  writeOutletSelection,
  type OutletSelectionResult,
  type SelectableOutlet,
  type StoredOutletSelection,
} from '@/lib/outlets/outlet-selection'
import { writeLinkedOutletSlug } from '@/lib/outlets/linked-outlet'
import { requestOutletGeoOrigin, type GeoResult } from '@/lib/outlets/geolocation'
import { rankOutlets, type OutletOrderMode } from '@/lib/outlets/nearest-outlet'

/**
 * Wires the pure selection logic to the browser: storage, the `?outlet=` param,
 * and geolocation. Every decision it makes comes from `resolveOutletSelection`
 * — this hook only supplies the inputs and persists the answer.
 *
 * With `isEnabled` false it does nothing at all beyond clearing any leftover
 * selection, so a single-location tenant runs the same code path as today.
 */
export function useOutletSelection({
  isEnabled,
  tenantSlug,
  outlets,
  hasCartItems = false,
}: {
  isEnabled: boolean
  tenantSlug: string
  outlets: readonly SelectableOutlet[]
  hasCartItems?: boolean
}) {
  const searchParams = useSearchParams()
  const urlSlug = searchParams?.get('outlet') ?? null

  const [stored, setStored] = useState<StoredOutletSelection | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [geo, setGeo] = useState<GeoResult | null>(null)
  const [isLocating, setIsLocating] = useState(false)

  // Storage is read after mount: reading it during render would produce
  // server/client markup that disagrees.
  useEffect(() => {
    if (typeof window === 'undefined') return
    setStored(isEnabled ? readOutletSelection(window.localStorage, tenantSlug, Date.now()) : null)
    setIsHydrated(true)
  }, [isEnabled, tenantSlug])

  const resolution: OutletSelectionResult = useMemo(
    () => resolveOutletSelection({ isEnabled, outlets, stored, urlSlug, hasCartItems }),
    [isEnabled, outlets, stored, urlSlug, hasCartItems]
  )

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return
    if (resolution.shouldClearStorage) {
      clearOutletSelection(window.localStorage, tenantSlug)
    }
  }, [isHydrated, resolution.shouldClearStorage, tenantSlug])

  /**
   * Remember the branch a `/b/{slug}` link named, so the walk from the menu to
   * checkout does not lose it. Written only when the slug resolved to a real,
   * active branch — a dead or mistyped code prompts instead, and must not leave
   * a branch behind for checkout to trust.
   *
   * Kept out of the stored SELECTION because that record carries a mode the
   * customer picked and a link has none; see `linked-outlet.ts`.
   */
  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return
    if (!isEnabled || urlSlug === null || resolution.outlet === null) return
    writeLinkedOutletSlug(window.localStorage, tenantSlug, resolution.outlet.slug, Date.now())
  }, [isHydrated, isEnabled, urlSlug, resolution.outlet, tenantSlug])

  const select = useCallback(
    (outletId: string, mode: OutletOrderMode | null) => {
      const selection: StoredOutletSelection = { outletId, mode }
      if (typeof window !== 'undefined') {
        writeOutletSelection(window.localStorage, tenantSlug, selection, Date.now())
      }
      setStored(selection)
    },
    [tenantSlug]
  )

  const reset = useCallback(() => {
    if (typeof window !== 'undefined') clearOutletSelection(window.localStorage, tenantSlug)
    setStored(null)
  }, [tenantSlug])

  /** Ask the browser for a location. Always resolves; never blocks the picker. */
  const locate = useCallback(async () => {
    setIsLocating(true)
    const result = await requestOutletGeoOrigin(
      typeof navigator === 'undefined' ? undefined : navigator.geolocation
    )
    setGeo(result)
    setIsLocating(false)
    return result
  }, [])

  /** Branch list for a mode, ranked by distance when a location is known. */
  const rankFor = useCallback(
    (mode: OutletOrderMode | null) =>
      rankOutlets(resolution.choices, { mode, origin: geo?.origin ?? null }),
    [resolution.choices, geo]
  )

  return {
    ...resolution,
    // Before hydration nothing is known, so never flash the picker at a
    // customer whose stored choice is about to load.
    shouldPrompt: isHydrated && resolution.shouldPrompt,
    isHydrated,
    geo,
    isLocating,
    locate,
    rankFor,
    select,
    reset,
  }
}
