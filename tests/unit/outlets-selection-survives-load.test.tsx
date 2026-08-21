/**
 * A chosen branch has to survive the walk from the splash to checkout.
 *
 * The splash chooser writes the branch to `selected_outlet_<slug>` and every
 * later surface reads it back from there. But surfaces that were handed a dish
 * rather than a menu — the product detail page, the cart, the upsell sheets —
 * fetch the branch list themselves, so for the first render they hold an EMPTY
 * list. An empty list is indistinguishable from "this merchant has no branches"
 * unless the caller says which one it is, and `resolveOutletSelection` treats
 * "no branches" as grounds to drop the stored selection.
 *
 * The result in production: the customer picks a branch, taps a dish, and the
 * choice is deleted out from under them before they ever reach checkout — so
 * the order is written against no branch at all and lands in "Unassigned".
 *
 * These tests pin that a still-loading list is never mistaken for an empty one.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { useBranchPricing } from '@/hooks/use-branch-pricing'
import { useOutletSelection } from '@/hooks/use-outlet-selection'
import {
  OUTLET_SELECTION_KEY_PREFIX,
  writeOutletSelection,
  type SelectableOutlet,
} from '@/lib/outlets/outlet-selection'

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}))

const TENANT_SLUG = 'above-sea-level'
const TENANT = { id: 'tenant-1', multi_branch_enabled: true }

const outlet = (id: string, slug: string, sortOrder: number): SelectableOutlet => ({
  id,
  slug,
  name: slug,
  latitude: null,
  longitude: null,
  delivery_radius_km: null,
  supports_pickup: true,
  supports_delivery: true,
  supports_dine_in: true,
  is_active: true,
  sort_order: sortOrder,
})

const MONCADA = outlet('o-moncada', 'moncada', 0)
const CABANATUAN = outlet('o-cabanatuan', 'cabanatuan', 1)

/** Resolvers for the two queries `useBranchPricing` fires, held open by default. */
let releaseOutlets: (rows: SelectableOutlet[]) => void
let releaseOverrides: () => void

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const pending =
        table === 'outlets'
          ? new Promise((resolve) => {
              releaseOutlets = (rows) => resolve({ data: rows, error: null })
            })
          : new Promise((resolve) => {
              releaseOverrides = () => resolve({ data: [], error: null })
            })

      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.then = (onFulfilled: (value: unknown) => unknown) => pending.then(onFulfilled)
      return builder
    },
  }),
}))

const storageKey = `${OUTLET_SELECTION_KEY_PREFIX}${TENANT_SLUG}`

beforeEach(() => {
  window.localStorage.clear()
  writeOutletSelection(window.localStorage, TENANT_SLUG, { outletId: MONCADA.id, mode: 'dine_in' }, Date.now())
})

describe('a stored branch and a branch list that is still loading', () => {
  it('keeps the customer\'s branch while the surface is still fetching its branch list', async () => {
    // Arrange + Act: mount the surface but never resolve the outlets query.
    renderHook(() => useBranchPricing({ tenant: TENANT, tenantSlug: TENANT_SLUG }))

    // Assert: the choice made on the splash is still there to be read.
    await waitFor(() => expect(window.localStorage.getItem(storageKey)).not.toBeNull())
    expect(JSON.parse(window.localStorage.getItem(storageKey) as string)).toMatchObject({
      outletId: MONCADA.id,
    })
  })

  it('resolves the stored branch once the branch list arrives', async () => {
    // Arrange
    const { result } = renderHook(() => useBranchPricing({ tenant: TENANT, tenantSlug: TENANT_SLUG }))

    // Act
    await waitFor(() => expect(typeof releaseOutlets).toBe('function'))
    releaseOutlets([MONCADA, CABANATUAN])
    releaseOverrides()

    // Assert
    await waitFor(() => expect(result.current.selectedOutletId).toBe(MONCADA.id))
    expect(window.localStorage.getItem(storageKey)).not.toBeNull()
  })
})

describe('useOutletSelection with an unloaded branch list', () => {
  it('does not clear the stored branch when the list has not been read yet', async () => {
    // Arrange + Act
    const { result } = renderHook(() =>
      useOutletSelection({
        isEnabled: true,
        tenantSlug: TENANT_SLUG,
        outlets: [],
        hasLoadedOutlets: false,
      })
    )

    // Assert: nothing is known yet, so nothing is discarded and nothing is asked.
    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    expect(window.localStorage.getItem(storageKey)).not.toBeNull()
    expect(result.current.shouldPrompt).toBe(false)
  })

  it('still clears a branch the merchant has actually removed', async () => {
    // Arrange + Act: the list HAS been read, and it is empty.
    const { result } = renderHook(() =>
      useOutletSelection({
        isEnabled: true,
        tenantSlug: TENANT_SLUG,
        outlets: [],
        hasLoadedOutlets: true,
      })
    )

    // Assert
    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    await waitFor(() => expect(window.localStorage.getItem(storageKey)).toBeNull())
  })
})
