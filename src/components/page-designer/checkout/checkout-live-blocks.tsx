'use client'

import type { PageBlockRenderer, PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'

import { CHECKOUT_BLOCK_VIEWS } from './checkout-block-views'
import { useCheckoutBlocks } from './checkout-blocks-context'

/** A storefront block: its view fed by the page's live checkout. */
function liveBlock(id: string): PageBlockRenderer {
  const View = CHECKOUT_BLOCK_VIEWS[id]
  function LiveCheckoutBlock(props: PageBlockRenderProps) {
    const value = useCheckoutBlocks()
    if (!value || !View) return null
    return <View checkout={value.checkout} block={props} />
  }
  LiveCheckoutBlock.displayName = `LiveCheckoutBlock(${id})`
  return LiveCheckoutBlock
}

/** Storefront renderers for every checkout block, keyed by block id. */
export const CHECKOUT_LIVE_BLOCKS: Readonly<Record<string, PageBlockRenderer>> = Object.fromEntries(
  Object.keys(CHECKOUT_BLOCK_VIEWS).map((id) => [id, liveBlock(id)]),
)
