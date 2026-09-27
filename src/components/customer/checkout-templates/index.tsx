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
import { CHECKOUT_TEMPLATE_IDS, DEFAULT_CHECKOUT_TEMPLATE, type CheckoutTemplate } from '@/lib/checkout-templates'
import { pickDesignId } from '@/lib/design-ids'
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
const BiteSpeedCheckout = dynamic(
  () => import('./bitespeed-checkout').then((m) => ({ default: m.BiteSpeedCheckout })),
  { loading: CheckoutLoading },
)

interface CheckoutDesignProps {
  checkout: UseCheckoutReturn
}

// Typed against the registry's id union: a registered design without a
// component here is a compile error.
const CHECKOUT_COMPONENTS = {
  classic: ClassicCheckout,
  modern: ModernCheckout,
  wizard: WizardCheckout,
  minimal: MinimalCheckout,
  express: ExpressCheckout,
  bitespeed: BiteSpeedCheckout,
} satisfies Record<CheckoutTemplate, unknown>

/**
 * Resolve the checkout design component for a template id.
 * Unknown/typo'd ids fall back to Classic (matches card-template behaviour).
 */
export function getCheckoutTemplateComponent(template: CheckoutTemplate = DEFAULT_CHECKOUT_TEMPLATE) {
  return CHECKOUT_COMPONENTS[pickDesignId(template, CHECKOUT_TEMPLATE_IDS, DEFAULT_CHECKOUT_TEMPLATE)]
}

/**
 * Renders the selected checkout design. Only the chosen design's JS chunk loads.
 */
export function CheckoutTemplateRenderer({
  template = DEFAULT_CHECKOUT_TEMPLATE,
  checkout,
}: CheckoutDesignProps & { template?: CheckoutTemplate }) {
  const DesignComponent = getCheckoutTemplateComponent(template)
  return <DesignComponent checkout={checkout} />
}
