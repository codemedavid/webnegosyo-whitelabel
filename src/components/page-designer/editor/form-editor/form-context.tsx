'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import type { SampleCheckoutForm } from '@/components/page-designer/checkout/sample-checkout'

import type { CheckoutFormEditor } from './use-checkout-form'

/** The form editor's state, plus "Save form now" (the editor owns the save). */
export interface CheckoutFormContextValue {
  form: CheckoutFormEditor
  onSaveNow: () => void
  isSaving: boolean
}

const CheckoutFormContext = createContext<CheckoutFormContextValue | null>(null)

export function CheckoutFormProvider({ value, children }: { value: CheckoutFormContextValue; children: ReactNode }) {
  return <CheckoutFormContext.Provider value={value}>{children}</CheckoutFormContext.Provider>
}

/** The form editor, or null outside the checkout Page Designer. */
export function useCheckoutFormEditor(): CheckoutFormContextValue | null {
  return useContext(CheckoutFormContext)
}

/**
 * What the canvas's sample checkout asks: the store's order types and the
 * draft questions of the tab open in the form editor (null outside the editor,
 * where the sample keeps its own three questions).
 */
export function useCheckoutFormPreview(): SampleCheckoutForm | null {
  const editor = useCheckoutFormEditor()
  const form = editor?.form
  return useMemo(() => {
    if (!form?.activeId) return null
    return {
      orderTypes: form.tabs.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        description: t.description,
        advance_order_enabled: t.advanceOrderEnabled,
      })),
      orderTypeId: form.activeId,
      // A new question has no stored name yet; its id keeps answers apart.
      fields: (form.draft[form.activeId] ?? []).map((q) => ({ ...q, field_name: q.field_name || q.id })),
    }
  }, [form?.activeId, form?.tabs, form?.draft])
}
