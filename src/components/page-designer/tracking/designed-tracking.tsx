'use client'

/**
 * The tracking page's body as the owner designed it (Page Designer →
 * Order tracking). Rendered by TrackingDashboard INSIDE its themed root, so
 * every block paints from the same `--trk-*` variables as the standard page;
 * the ready alert stays the dashboard's (global, never a block).
 */

import { useMemo } from 'react'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import type { StorefrontLabels } from '@/lib/storefront-labels'
import type { PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { DesignedPage } from '@/components/page-designer/storefront/designed-page'
import { TRACKING_LIVE_BLOCKS } from './live-blocks'
import { TrackingBlocksProvider, type TrackingBlocksValue } from './tracking-blocks-context'
import { trackingTokens } from './tracking-runtime'

interface DesignedTrackingProps {
  /** Already prepared for the page (resolvePageDesign). */
  design: HeroDesignV5
  tenantSlug: string
  blocks: TrackingBlocksValue
  labels: StorefrontLabels
}

export function DesignedTracking({ design, tenantSlug, blocks, labels }: DesignedTrackingProps) {
  const { storeName, data, shortId } = blocks
  const tokens = useMemo(() => trackingTokens({ storeName, data, shortId }), [storeName, data, shortId])
  // The order's status is the page state: each poll that moves it re-renders "Show when".
  const runtime = useMemo<PageRuntime>(
    () => ({ page: 'tracking', state: data.status, tokens, labels, blocks: TRACKING_LIVE_BLOCKS }),
    [data.status, tokens, labels],
  )
  return (
    <TrackingBlocksProvider value={blocks}>
      <DesignedPage design={design} runtime={runtime} tenantSlug={tenantSlug} />
    </TrackingBlocksProvider>
  )
}
