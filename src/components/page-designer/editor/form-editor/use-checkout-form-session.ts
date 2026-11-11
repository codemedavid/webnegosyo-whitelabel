'use client'

import { type ComponentType, useLayoutEffect, useMemo, useRef, useTransition } from 'react'
import { toast } from 'sonner'

import { saveCheckoutFormAction } from '@/app/actions/page-designer'
import { toggleOrderTypeAdvanceOrderAction } from '@/app/actions/order-types'
import { settleAction } from '@/lib/hero-builder/settle-action'
import type { Widget } from '@/lib/hero-builder/types'

import { CustomerFormPanel } from './customer-form-panel'
import type { CheckoutFormContextValue } from './form-context'
import type { PendingForm } from './form-publish'
import { ScheduleOrdersPanel } from './schedule-orders-panel'
import { useCheckoutForm, type CheckoutFormSource } from './use-checkout-form'

/** The checkout blocks with a Content-tab panel of their own. */
export const CHECKOUT_BLOCK_PANELS: Readonly<Record<string, ComponentType<{ widget: Widget }>>> = {
  'checkout.customer': CustomerFormPanel,
  'checkout.schedule': ScheduleOrdersPanel,
}

/**
 * The Page Designer's checkout form editor, wired for the editor: its state,
 * the context the panel and the canvas sample read, "Save form now", and the
 * unsaved questions Publish reads at the moment it runs.
 */
export function useCheckoutFormSession(tenantId: string, tenantSlug: string, source: CheckoutFormSource | null) {
  const form = useCheckoutForm(tenantId, source)
  const [isSaving, startSaving] = useTransition()
  const pending = useRef<PendingForm | null>(null)
  // Kept current after each commit (never during render), read when Publish runs.
  useLayoutEffect(() => {
    pending.current = { input: form.input, onSaved: form.markSaved }
  })

  const { input, markSaved, setAdvanceOrder } = form
  const context = useMemo<CheckoutFormContextValue>(
    () => ({
      form,
      isSaving,
      onSaveNow: () =>
        startSaving(async () => {
          const sent = input
          if (!sent) return
          const result = await settleAction(() => saveCheckoutFormAction(tenantId, sent), 'saveCheckoutForm')
          // Part-way saves come back with what was stored: take it, so retrying never doubles a question.
          const stored = 'form' in result ? result.form : undefined
          if (stored) markSaved(sent, stored)
          if (!result.success || !stored) {
            toast.error(result.error ?? 'Could not save the questions')
            return
          }
          toast.success('Questions saved — your checkout asks them now')
        }),
      onToggleAdvanceOrder: (id, isOn) => {
        setAdvanceOrder(id, isOn)
        // A request that never answered is undone too, never left showing a change the store didn't take.
        void settleAction(() => toggleOrderTypeAdvanceOrderAction(id, tenantId, tenantSlug, isOn), 'toggleAdvanceOrder').then((result) => {
          if (result.success) return
          setAdvanceOrder(id, !isOn)
          toast.error(result.error ?? 'Could not change pre-orders')
        })
      },
    }),
    [form, isSaving, input, markSaved, setAdvanceOrder, tenantId, tenantSlug],
  )

  return { form, context, pending, isEnabled: source !== null }
}
