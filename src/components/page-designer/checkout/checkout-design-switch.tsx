'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'

import type { CheckoutTemplate } from '@/lib/checkout-templates'
import { resolvePageDesign } from '@/lib/page-designer/page-mode'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { CheckoutTemplateRenderer } from '@/components/customer/checkout-templates'
import { CheckoutLoading } from '@/components/customer/checkout-templates/checkout-shared'

// The builder renderer ships only to stores that published a checkout design.
const DesignedCheckout = dynamic(
  () => import('./designed-checkout').then((m) => ({ default: m.DesignedCheckout })),
  { loading: CheckoutLoading },
)

interface CheckoutDesignSwitchProps {
  template: CheckoutTemplate
  checkout: UseCheckoutReturn
}

/**
 * The checkout form: the owner's published Page Designer design when there is
 * one, else the store's standard design exactly as before. Columns missing
 * (migration not applied) or off read as "no design".
 */
export function CheckoutDesignSwitch({ template, checkout }: CheckoutDesignSwitchProps) {
  const { tenant } = checkout
  const design = useMemo(
    () => resolvePageDesign(tenant as unknown as Readonly<Record<string, unknown>> | null, 'checkout'),
    [tenant],
  )
  if (design) return <DesignedCheckout design={design} checkout={checkout} />
  return <CheckoutTemplateRenderer template={template} checkout={checkout} />
}
