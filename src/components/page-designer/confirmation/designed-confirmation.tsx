'use client'

/**
 * The thank-you page's body as the owner designed it (Page Designer →
 * Thank-you page). Rendered by CheckoutConfirmation INSIDE its `--co-*`
 * themed root and its ConfirmationBlocksProvider, so every block paints from
 * the same variables as the standard page.
 */

import { useMemo } from 'react'

import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import type { StorefrontLabels } from '@/lib/storefront-labels'
import type { PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { DesignedPage } from '@/components/page-designer/storefront/designed-page'

import { useConfirmationBlocks } from './confirmation-context'
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
  const tokens = useMemo(() => (order ? confirmationTokens(storeName, order, grandTotal) : {}), [storeName, order, grandTotal])
  const runtime = useMemo<PageRuntime>(
    () => ({ page: 'confirmation', state, tokens, labels, blocks: CONFIRMATION_LIVE_BLOCKS }),
    [state, tokens, labels],
  )
  if (!b) return null
  return <DesignedPage design={design} runtime={runtime} tenantSlug={tenantSlug} />
}
