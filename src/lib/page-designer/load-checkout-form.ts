import { getAllOrderTypesWithFormFields } from '@/lib/order-types-service'
import { formDraftFromRows, type CheckoutFormSource } from './form-changes'

/**
 * The checkout form editor's starting point: every order type and its
 * questions, read with the owner's session (RLS). Null when the read fails —
 * the page still opens, without the form editor.
 */
export async function loadCheckoutFormSource(tenantId: string): Promise<CheckoutFormSource | null> {
  try {
    const orderTypes = await getAllOrderTypesWithFormFields(tenantId)
    const rows = orderTypes.flatMap((t) => (t.customer_form_fields ?? []).map((field) => ({ ...field, order_type_id: t.id })))
    return {
      orderTypes: orderTypes.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        description: t.description ?? null,
        isEnabled: t.is_enabled,
        advanceOrderEnabled: !!t.advance_order_enabled,
        isOnWeb: t.available_on_web !== false,
      })),
      saved: formDraftFromRows(orderTypes.map((t) => t.id), rows),
    }
  } catch (error) {
    console.error('[loadCheckoutFormSource] Could not read the order types:', error)
    return null
  }
}
