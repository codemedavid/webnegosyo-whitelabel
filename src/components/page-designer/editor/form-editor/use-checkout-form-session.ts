'use client'

import { useMemo, useRef, useTransition, type ComponentType } from 'react'
import { toast } from 'sonner'

import { saveCheckoutFormAction } from '@/app/actions/page-designer'
import type { Widget } from '@/lib/hero-builder/types'

import { CustomerFormPanel } from './customer-form-panel'
import type { CheckoutFormContextValue } from './form-context'
import type { PendingForm } from './form-publish'
import { useCheckoutForm, type CheckoutFormSource } from './use-checkout-form'

/** The checkout blocks with a Content-tab panel of their own. */
export const CHECKOUT_BLOCK_PANELS: Readonly<Record<string, ComponentType<{ widget: Widget }>>> = {
  'checkout.customer': CustomerFormPanel,
}

/**
 * The Page Designer's checkout form editor, wired for the editor: its state,
 * the context the panel and the canvas sample read, "Save form now", and the
 * unsaved questions Publish reads at the moment it runs.
 */
export function useCheckoutFormSession(tenantId: string, source: CheckoutFormSource | null) {
  const form = useCheckoutForm(tenantId, source)
  const [isSaving, startSaving] = useTransition()
  const pending = useRef<PendingForm | null>(null)
  pending.current = { input: form.input, onSaved: form.markSaved }

  const { input, markSaved } = form
  const context = useMemo<CheckoutFormContextValue>(
    () => ({
      form,
      isSaving,
      onSaveNow: () =>
        startSaving(async () => {
          const sent = input
          if (!sent) return
          const result = await saveCheckoutFormAction(tenantId, sent)
          if (!result.success || !result.form) {
            toast.error(result.error ?? 'Could not save the questions')
            return
          }
          markSaved(sent, result.form)
          toast.success('Questions saved — your checkout asks them now')
        }),
    }),
    [form, isSaving, input, markSaved, tenantId],
  )

  return { form, context, pending, isEnabled: source !== null }
}
