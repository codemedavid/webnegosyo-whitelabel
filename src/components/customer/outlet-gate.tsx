'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useOutletSelection } from '@/hooks/use-outlet-selection'
import { useCart } from '@/hooks/useCart'
import { createClient } from '@/lib/supabase/client'
import { resolveOrderTypeIdForMode } from '@/lib/outlets/mode-order-type'
import type { OrderType } from '@/types/database'
import { OutletSplash } from '@/components/customer/outlet-splash'
import type { PickerOutlet } from '@/components/customer/outlet-picker-screen'
import { shouldGateMenuForOutlet } from '@/lib/outlets/selection-timing'
import { rankOutlets } from '@/lib/outlets/nearest-outlet'
import type { SelectableOutlet } from '@/lib/outlets/outlet-selection'
import type { OutletOrderMode, RankedOutlet } from '@/lib/outlets/nearest-outlet'
import type { Outlet, Tenant } from '@/types/database'

/**
 * `rankOutlets` is generic over the outlet shape, but the hook types its
 * `choices` as the leaner `SelectableOutlet`. The rows are the same objects —
 * full `Outlet` records straight from the query — so the cast re-widens them to
 * what the picker renders rather than converting anything.
 */
type OutletSplashRankFor = (
  mode: OutletOrderMode | null
) => { outlets: RankedOutlet<PickerOutlet>[] }

interface OutletGateProps {
  tenant: Tenant | null
  tenantSlug: string
  outlets: Outlet[]
  /**
   * Branding Studio "Welcome Page" surface: force the splash open with inert
   * handlers so the editor always sees the page — a remembered branch, a
   * single-location tenant or the 'after' timing would otherwise hide it.
   */
  isPreview?: boolean
}

/**
 * Decides whether the customer sees the branch chooser before the menu.
 *
 * Renders nothing at all unless the tenant opted in AND has two or more active
 * branches AND asked for the branch BEFORE the menu AND the customer has not
 * already chosen one — so a single-location tenant, one with the flag off, or
 * one that moved the question to checkout gets exactly today's storefront. The
 * menu itself is untouched; this sits over it and then gets out of the way.
 */
export function OutletGate({ tenant, tenantSlug, outlets, isPreview }: OutletGateProps) {
  if (isPreview) return <OutletGatePreview tenant={tenant} outlets={outlets} />
  if (!shouldGateMenuForOutlet(tenant, outlets)) return null

  return (
    <Suspense fallback={null}>
      <OutletGateInner tenant={tenant} tenantSlug={tenantSlug} outlets={outlets} />
    </Suspense>
  )
}

/**
 * Studio preview: the real splash with real outlets but nothing persisted —
 * selecting a branch or locating does nothing, ranking is manual order only.
 */
function OutletGatePreview({ tenant, outlets }: { tenant: Tenant | null; outlets: Outlet[] }) {
  return (
    <OutletSplash
      tenantName={tenant?.name ?? ''}
      logoUrl={tenant?.logo_url ?? null}
      promoImageUrl={tenant?.flash_screen_image_url ?? null}
      promoHeadline={tenant?.flash_screen_title ?? null}
      outlets={outlets as unknown as PickerOutlet[]}
      reason={null}
      isLocating={false}
      onLocate={() => {}}
      rankFor={((mode) =>
        rankOutlets(outlets as unknown as PickerOutlet[], {
          mode,
          origin: null,
        })) as unknown as OutletSplashRankFor}
      onSelect={() => {}}
      welcome={tenant}
    />
  )
}

// Split out because useSearchParams requires a Suspense boundary above it.
function OutletGateInner({ tenant, tenantSlug, outlets }: OutletGateProps) {
  const selection = useOutletSelection({
    isEnabled: true,
    tenantSlug,
    outlets: outlets as unknown as SelectableOutlet[],
  })
  const { setOrderType } = useCart()
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([])

  // Loaded only once the picker is actually showing, which is the multi-branch
  // path alone — a single-location storefront pays nothing for this.
  useEffect(() => {
    if (!selection.shouldPrompt || !tenant?.id) return
    let isCurrent = true

    createClient()
      .from('order_types')
      .select('*')
      .eq('tenant_id', tenant.id)
      .then(({ data, error }) => {
        // A failure here costs a convenience, not the order: checkout still
        // asks for an order type exactly as it does today.
        if (error || !isCurrent) return
        setOrderTypes((data ?? []) as unknown as OrderType[])
      })

    return () => {
      isCurrent = false
    }
  }, [selection.shouldPrompt, tenant?.id])

  /**
   * Record the branch, then carry the mode forward as the order type so
   * checkout does not ask the same question twice. No match simply leaves the
   * order type unset, which is today's behaviour — as does a mode-less
   * selection from the welcome page's single CTA, where checkout asks.
   */
  const handleSelect = useCallback(
    (outletId: string, mode: OutletOrderMode | null) => {
      selection.select(outletId, mode)
      const orderTypeId = mode ? resolveOrderTypeIdForMode(orderTypes, mode) : null
      if (orderTypeId) setOrderType(orderTypeId)
    },
    [selection, orderTypes, setOrderType]
  )

  if (!selection.shouldPrompt) return null

  return (
    <OutletSplash
      tenantName={tenant?.name ?? ''}
      logoUrl={tenant?.logo_url ?? null}
      promoImageUrl={tenant?.flash_screen_image_url ?? null}
      promoHeadline={tenant?.flash_screen_title ?? null}
      outlets={selection.choices as unknown as PickerOutlet[]}
      reason={selection.reason}
      isLocating={selection.isLocating}
      onLocate={selection.locate}
      rankFor={selection.rankFor as unknown as OutletSplashRankFor}
      onSelect={handleSelect}
      welcome={tenant}
    />
  )
}
