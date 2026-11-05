'use client'

import type { ReactNode } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { withCheckoutColors } from '@/lib/page-designer/checkout-colors'
import { checkoutThemeStyle } from '@/components/customer/checkout-templates/checkout-theme'
import type { PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'

/**
 * The checkout as this block should paint it: the block's own colours (if
 * the owner set any) in place of the store's. Pass the result to the block's
 * components and wrap the block in <BlockColors> so its card picks them up.
 */
export function blockCheckout(checkout: UseCheckoutReturn, block: PageBlockRenderProps): UseCheckoutReturn {
  return withCheckoutColors(checkout, block.option)
}

/** Re-publishes the `--co-*` variables when the block changed a colour; otherwise renders children as they are. */
export function BlockColors({ checkout, themed, children }: { checkout: UseCheckoutReturn; themed: UseCheckoutReturn; children: ReactNode }) {
  if (themed === checkout) return <>{children}</>
  return <div style={checkoutThemeStyle(themed)}>{children}</div>
}
