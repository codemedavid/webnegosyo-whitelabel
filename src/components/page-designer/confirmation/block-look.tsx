'use client'

/**
 * What a thank-you block's design settings say: its design, its button shape
 * and its own colours. Colours are applied by re-publishing the `--co-*`
 * variables on a wrapper, resolved from the page's own store row with the
 * block's colours in place of the store's — so every derived shade (soft
 * wash, readable button text) follows, and a block that sets no colour gets
 * no wrapper at all.
 */

import { useMemo, type ReactNode } from 'react'

import { withCheckoutColors } from '@/lib/page-designer/checkout-colors'
import { checkoutThemeVars, resolveCheckoutTheme } from '@/components/customer/checkout-templates/checkout-theme'
import type { PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'

import { useConfirmationBlocks } from './confirmation-context'

/** A choice option as a string ('' when unset; stored values are already validated). */
export function choiceOf(block: Pick<PageBlockRenderProps, 'option'>, key: string): string {
  const value = block.option(key)
  return typeof value === 'string' ? value : ''
}

/** The block's design (`variant`), falling back to its first design. */
export function designOf<T extends string>(block: Pick<PageBlockRenderProps, 'option'>, first: T): T {
  return (choiceOf(block, 'variant') || first) as T
}

export type ButtonShape = 'pill' | 'rounded' | 'square'

/** Radius class per button shape; `pill` is today's buttons. */
export function buttonShapeClass(block: Pick<PageBlockRenderProps, 'option'>): string {
  switch (choiceOf(block, 'button_shape')) {
    case 'rounded':
      return 'rounded-xl'
    case 'square':
      return 'rounded-none'
    default:
      return 'rounded-full'
  }
}

/**
 * Wraps the block in its own `--co-*` colours when the owner set any.
 * The wrapper re-applies the text colour too: `color` is inherited as the
 * page root's resolved value, not re-read from the new variable.
 */
export function BlockColors({ block, children }: { block: Pick<PageBlockRenderProps, 'option'>; children: ReactNode }) {
  const source = useConfirmationBlocks()?.themeSource
  const { option } = block
  const style = useMemo(() => {
    if (!source) return null
    const themed = withCheckoutColors(source, option)
    return themed === source ? null : checkoutThemeVars(resolveCheckoutTheme(themed.tenant, themed.branding))
  }, [source, option])
  if (!style) return <>{children}</>
  return (
    <div data-block-colors="" className="text-[color:var(--co-text)]" style={style}>
      {children}
    </div>
  )
}
