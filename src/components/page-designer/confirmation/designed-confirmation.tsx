'use client'

/**
 * The thank-you page's body as the owner designed it (Page Designer →
 * Thank-you page). Rendered by CheckoutConfirmation INSIDE its `--co-*`
 * themed root and its ConfirmationBlocksProvider, so every block paints from
 * the same variables as the standard page.
 */

import { useMemo } from 'react'

import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { blockIdsIn } from '@/lib/page-designer/design-blocks'
import { preparePageDesign } from '@/lib/page-designer/rules'
import type { StorefrontLabels } from '@/lib/storefront-labels'
import type { PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { DesignedPage } from '@/components/page-designer/storefront/designed-page'

import { ConfirmationBlocksProvider, useConfirmationBlocks } from './confirmation-context'
import { confirmationState, confirmationTokens } from './confirmation-runtime'
import { CONFIRMATION_LIVE_BLOCKS } from './live-blocks'

interface DesignedConfirmationProps {
  /** Already prepared for the page (resolvePageDesign). */
  design: HeroDesignV5
  tenantSlug: string
  labels: StorefrontLabels
}

export function DesignedConfirmation({ design, tenantSlug, labels }: DesignedConfirmationProps) {
  const b = useConfirmationBlocks()
  const storeName = b?.storeName ?? ''
  const order = b?.order ?? null
  const grandTotal = b?.grandTotal ?? 0
  const state = confirmationState(b?.hasOrderSaveFailed ?? false)
  const storeAddress = b?.storeAddress ?? ''
  const orderKind = b?.orderKind ?? null
  const tokens = useMemo(() => (order ? confirmationTokens(storeName, order, grandTotal, storeAddress) : {}), [storeName, order, grandTotal, storeAddress])
  const runtime = useMemo<PageRuntime>(
    () => ({ page: 'confirmation', state, orderKind, tokens, labels, blocks: CONFIRMATION_LIVE_BLOCKS }),
    [state, orderKind, tokens, labels],
  )
  // Without the Messenger block there is no message to send, so a failed save
  // says "contact the store" instead of pointing at a message that isn't there.
  const hasMessengerBlock = useMemo(() => blockIdsIn(design).includes('confirmation.messenger'), [design])
  const value = useMemo(
    () => (b && !hasMessengerBlock && b.hasMessengerFallback ? { ...b, hasMessengerFallback: false } : b),
    [b, hasMessengerBlock],
  )
  // A kiosk needs its "Start a new order" card even when the owner removed the actions block.
  const isKiosk = !!b?.isKiosk
  const shown = useMemo(() => preparePageDesign(design, 'confirmation', { kiosk: isKiosk }), [design, isKiosk])
  if (!value) return null
  return (
    <ConfirmationBlocksProvider value={value}>
      <DesignedPage design={shown} runtime={runtime} tenantSlug={tenantSlug} />
    </ConfirmationBlocksProvider>
  )
}
