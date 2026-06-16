/**
 * Cart Templates Index
 *
 * Registry + lazy-loader for selectable cart designs. Only the active tenant's
 * design chunk is downloaded (code-splitting). Every design is a pure-presentation
 * component receiving the shared useCartView() return value as its `cart` prop.
 * The remove dialog + upsell interstitial are rendered by the page shell.
 */

import dynamic from 'next/dynamic'
import type { CartTemplate } from '@/lib/cart-templates'
import type { UseCartViewReturn } from '@/hooks/useCartView'
import { CartLoading } from './cart-shared'

const ClassicCart = dynamic(
  () => import('./classic-cart').then((m) => ({ default: m.ClassicCart })),
  { loading: CartLoading },
)
const ModernCart = dynamic(
  () => import('./modern-cart').then((m) => ({ default: m.ModernCart })),
  { loading: CartLoading },
)
const WizardCart = dynamic(
  () => import('./wizard-cart').then((m) => ({ default: m.WizardCart })),
  { loading: CartLoading },
)
const MinimalCart = dynamic(
  () => import('./minimal-cart').then((m) => ({ default: m.MinimalCart })),
  { loading: CartLoading },
)
const ExpressCart = dynamic(
  () => import('./express-cart').then((m) => ({ default: m.ExpressCart })),
  { loading: CartLoading },
)

interface CartDesignProps {
  cart: UseCartViewReturn
}

/**
 * Resolve the cart design component for a template id.
 * Unknown/typo'd ids fall back to Classic.
 */
export function getCartTemplateComponent(template: CartTemplate = 'classic') {
  switch (template) {
    case 'modern':
      return ModernCart
    case 'wizard':
      return WizardCart
    case 'minimal':
      return MinimalCart
    case 'express':
      return ExpressCart
    case 'classic':
    default:
      return ClassicCart
  }
}

/**
 * Renders the selected cart design. Only the chosen design's JS chunk loads.
 */
export function CartTemplateRenderer({
  template = 'classic',
  cart,
}: CartDesignProps & { template?: CartTemplate }) {
  const DesignComponent = getCartTemplateComponent(template)
  return <DesignComponent cart={cart} />
}
