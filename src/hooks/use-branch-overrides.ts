'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  OUTLET_MENU_OVERRIDE_SELECT,
  type OutletMenuOverride,
} from '@/lib/outlets/outlet-menu-repository'
import type { OutletMenuOverrideRow } from '@/lib/outlets/outlet-menu-overrides'

/**
 * A tenant's per-branch overrides, fetched in the browser.
 *
 * The menu page gets these from the server, because it renders the grid on the
 * first paint and a price that changes a moment later is worse than a slow one.
 * Every other customer-facing surface — the product detail page, the cart's
 * re-check, upsell suggestions — is reached with a branch already chosen and an
 * item already on screen, so fetching on mount costs nothing visible and saves
 * threading the same array through four server components.
 *
 * Reads are public by RLS (`outlet_menu_items_select_public`): this is the price
 * on the board outside the shop.
 *
 * Disabled tenants never issue the query, and a failure resolves to "no
 * overrides" WITH a flag — callers that can act on it (blocking checkout)
 * should read `didFail` rather than assume an empty list means agreement.
 */
export function useBranchOverrides({
  tenantId,
  isEnabled,
}: {
  tenantId: string | null | undefined
  isEnabled: boolean
}): { overrides: OutletMenuOverrideRow[]; isLoading: boolean; didFail: boolean } {
  const [overrides, setOverrides] = useState<OutletMenuOverrideRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [didFail, setDidFail] = useState(false)

  useEffect(() => {
    if (!isEnabled || !tenantId) {
      setOverrides([])
      setDidFail(false)
      return
    }

    let isCurrent = true
    setIsLoading(true)

    createClient()
      .from('outlet_menu_items')
      .select(OUTLET_MENU_OVERRIDE_SELECT)
      .eq('tenant_id', tenantId)
      .then(({ data, error }) => {
        if (!isCurrent) return
        setIsLoading(false)
        if (error) {
          console.warn('[use-branch-overrides] Branch menu query failed:', error.message)
          setDidFail(true)
          setOverrides([])
          return
        }
        setDidFail(false)
        setOverrides((data ?? []) as unknown as OutletMenuOverride[])
      })

    return () => {
      isCurrent = false
    }
  }, [tenantId, isEnabled])

  return { overrides, isLoading, didFail }
}
