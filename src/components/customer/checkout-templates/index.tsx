/**
 * Checkout Templates Index
 *
 * Registry + lazy-loader for the selectable checkout designs. Only the active
 * tenant's design chunk is downloaded (code-splitting via next/dynamic), so
 * shipping more designs never bloats the checkout bundle.
 *
 * Every design is a pure-presentation component that receives the shared
 * useCheckout() return value as its single `checkout` prop. The confirmation
 * screen and payment/QR dialogs are rendered by the page shell, not here.
 */

import dynamic from 'next/dynamic'
import type { CheckoutTemplate } from '@/lib/checkout-templates'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { CheckoutLoading } from './checkout-shared'

// Lazily-loaded checkout designs — only the active design's chunk is fetched.
const ClassicCheckout = dynamic(
  () => import('./classic-checkout').then((m) => ({ default: m.ClassicCheckout })),
  { loading: CheckoutLoading },
)
const ModernCheckout = dynamic(
  () => import('./modern-checkout').then((m) => ({ default: m.ModernCheckout })),
  { loading: CheckoutLoading },
)
const WizardCheckout = dynamic(
  () => import('./wizard-checkout').then((m) => ({ default: m.WizardCheckout })),
  { loading: CheckoutLoading },
)
const MinimalCheckout = dynamic(
  () => import('./minimal-checkout').then((m) => ({ default: m.MinimalCheckout })),
  { loading: CheckoutLoading },
)
const ExpressCheckout = dynamic(
  () => import('./express-checkout').then((m) => ({ default: m.ExpressCheckout })),
  { loading: CheckoutLoading },
)

interface CheckoutDesignProps {
  checkout: UseCheckoutReturn
}

/**
 * Resolve the checkout design component for a template id.
 * Unknown/typo'd ids fall back to Classic (matches card-template behaviour).
 */
export function getCheckoutTemplateComponent(template: CheckoutTemplate = 'classic') {
  switch (template) {
    case 'modern':
      return ModernCheckout
    case 'wizard':
      return WizardCheckout
    case 'minimal':
      return MinimalCheckout
    case 'express':
      return ExpressCheckout
    case 'classic':
    default:
      return ClassicCheckout
  }
}

/**
 * Renders the selected checkout design. Only the chosen design's JS chunk loads.
 */
export function CheckoutTemplateRenderer({
  template = 'classic',
  checkout,
}: CheckoutDesignProps & { template?: CheckoutTemplate }) {
  const DesignComponent = getCheckoutTemplateComponent(template)
  return <DesignComponent checkout={checkout} />
}
