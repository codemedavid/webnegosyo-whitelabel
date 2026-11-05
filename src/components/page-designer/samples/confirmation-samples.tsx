'use client'

import { useMemo } from 'react'

import { usePageRuntime, type PageBlockRenderer, type PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import { ConfirmationBlocksProvider } from '@/components/page-designer/confirmation/confirmation-context'
import { CONFIRMATION_LIVE_BLOCKS } from '@/components/page-designer/confirmation/live-blocks'
import { sampleConfirmationValue } from '@/components/page-designer/confirmation/sample-order'

/**
 * The live block renderer fed a SAMPLE order (no network, buttons inert).
 * The editor's state switcher drives the status: "Not confirmed" shows the
 * failure hero and notice exactly as a lost order would.
 */
function withSampleOrder(Live: PageBlockRenderer): PageBlockRenderer {
  function SampleBlock(props: PageBlockRenderProps) {
    const runtime = usePageRuntime()
    const storeName = runtime?.tokens.store ?? ''
    const isFailed = runtime?.state === 'failed'
    const store = runtime?.store
    const value = useMemo(() => sampleConfirmationValue(storeName, isFailed, store), [storeName, isFailed, store])
    return (
      <ConfirmationBlocksProvider value={value}>
        <Live {...props} />
      </ConfirmationBlocksProvider>
    )
  }
  SampleBlock.displayName = `Sample(${Live.displayName ?? Live.name ?? 'Block'})`
  return SampleBlock
}

/**
 * How each confirmation block looks in the Page Designer editor: the real component fed
 * SAMPLE data, buttons inert. Keyed by block id (src/lib/page-designer/blocks-confirmation.ts).
 * A block missing here shows a labelled placeholder on the canvas.
 */
export const CONFIRMATION_SAMPLE_BLOCKS: Readonly<Partial<Record<string, PageBlockRenderer>>> = Object.fromEntries(
  Object.entries(CONFIRMATION_LIVE_BLOCKS)
    .filter((entry): entry is [string, PageBlockRenderer] => Boolean(entry[1]))
    .map(([id, Live]) => [id, withSampleOrder(Live)]),
)
