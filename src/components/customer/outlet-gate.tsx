'use client'

import { Suspense } from 'react'
import { useOutletSelection } from '@/hooks/use-outlet-selection'
import { OutletSplash } from '@/components/customer/outlet-splash'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import type { SelectableOutlet } from '@/lib/outlets/outlet-selection'
import type { Outlet, Tenant } from '@/types/database'

interface OutletGateProps {
  tenant: Tenant | null
  tenantSlug: string
  outlets: Outlet[]
}

/**
 * Decides whether the customer sees the branch chooser before the menu.
 *
 * Renders nothing at all unless the tenant opted in AND has two or more active
 * branches AND the customer has not already chosen one — so a single-location
 * tenant, or one with the flag off, gets exactly today's storefront. The menu
 * itself is untouched; this sits over it and then gets out of the way.
 */
export function OutletGate({ tenant, tenantSlug, outlets }: OutletGateProps) {
  if (!isMultiBranchEnabled(tenant) || outlets.length < 2) return null

  return (
    <Suspense fallback={null}>
      <OutletGateInner tenant={tenant} tenantSlug={tenantSlug} outlets={outlets} />
    </Suspense>
  )
}

// Split out because useSearchParams requires a Suspense boundary above it.
function OutletGateInner({ tenant, tenantSlug, outlets }: OutletGateProps) {
  const selection = useOutletSelection({
    isEnabled: true,
    tenantSlug,
    outlets: outlets as unknown as SelectableOutlet[],
  })

  if (!selection.shouldPrompt) return null

  return (
    <OutletSplash
      tenantName={tenant?.name ?? ''}
      promoImageUrl={tenant?.flash_screen_image_url ?? null}
      promoHeadline={tenant?.flash_screen_title ?? null}
      supportsPickup={selection.choices.some((outlet) => outlet.supports_pickup)}
      supportsDelivery={selection.choices.some((outlet) => outlet.supports_delivery)}
      reason={selection.reason}
      isLocating={selection.isLocating}
      onLocate={selection.locate}
      rankFor={selection.rankFor}
      onSelect={selection.select}
    />
  )
}
