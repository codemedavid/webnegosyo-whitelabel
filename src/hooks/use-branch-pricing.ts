'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OUTLET_SELECT } from '@/lib/outlets/outlet-repository'
import { isMultiBranchEnabled, type MultiBranchTenantFields } from '@/lib/outlets/multi-branch-flag'
import { useOutletSelection } from '@/hooks/use-outlet-selection'
import { useBranchOverrides } from '@/hooks/use-branch-overrides'
import { useBranchMenu } from '@/hooks/use-branch-menu'
import type { SelectableOutlet } from '@/lib/outlets/outlet-selection'
import type { OverridableMenuItem } from '@/lib/outlets/outlet-menu-overrides'

/**
 * Branch pricing for a surface that was handed one dish rather than a menu.
 *
 * The product detail page, the cart, and the upsell sheets are all reached with
 * a branch already chosen, and all render items the server priced store-wide.
 * Rather than thread branches and overrides through four more server components
 * — every one of them a chance to drop a column and ship the feature dead, as
 * has happened twice in this codebase — they ask here and get a `resolve`.
 *
 * A tenant without the feature issues no queries and gets its items back
 * untouched, so nothing about the single-location path changes.
 */
export function useBranchPricing({
  tenant,
  tenantSlug,
}: {
  tenant: (MultiBranchTenantFields & { id?: string | null }) | null | undefined
  tenantSlug: string
}) {
  const isEnabled = isMultiBranchEnabled(tenant ?? null)
  const tenantId = tenant?.id ?? null

  const [outlets, setOutlets] = useState<SelectableOutlet[]>([])

  // Needed only to validate the stored branch: a selection naming a branch the
  // merchant has since switched off must not silently price the whole page.
  useEffect(() => {
    if (!isEnabled || !tenantId) {
      setOutlets([])
      return
    }

    let isCurrent = true
    createClient()
      .from('outlets')
      .select(OUTLET_SELECT)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (!isCurrent) return
        if (error) {
          console.warn('[use-branch-pricing] Branch query failed:', error.message)
          return
        }
        setOutlets((data ?? []) as unknown as SelectableOutlet[])
      })

    return () => {
      isCurrent = false
    }
  }, [tenantId, isEnabled])

  const selection = useOutletSelection({ isEnabled, tenantSlug, outlets })
  const { overrides, didFail } = useBranchOverrides({ tenantId, isEnabled })
  const { resolveItem } = useBranchMenu({
    items: [] as OverridableMenuItem[],
    overrides,
    selectedOutletId: selection.outlet?.id ?? null,
  })

  return useMemo(
    () => ({
      /** The dish as the chosen branch sells it. Identity when there is none. */
      resolve: resolveItem,
      /** Resolve a list, dropping anything this branch does not carry. */
      resolveAll: <T extends OverridableMenuItem>(items: readonly T[]): T[] =>
        items.map((item) => resolveItem(item)),
      selectedOutletId: selection.outlet?.id ?? null,
      /** True when the override query failed; the prices on screen may be wrong. */
      didFail,
    }),
    [resolveItem, selection.outlet?.id, didFail]
  )
}
