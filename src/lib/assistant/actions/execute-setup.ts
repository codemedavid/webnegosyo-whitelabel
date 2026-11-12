/**
 * Confirmed proposals that set the store up: payment methods and new
 * ingredients. Every write goes through the writer the admin screens use,
 * which re-checks the caller's permission on the request's session
 * (`store_setup` for payment methods; `menu` — and `costs` for a price — for
 * the ingredient master; `inventory` for its opening count).
 */

import 'server-only'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createPaymentMethod, updatePaymentMethod, updatePaymentMethodOrderTypes } from '@/lib/payment-methods-service'
import { createIngredient } from '@/lib/inventory/ingredients-service'
import { recordStockMovement } from '@/lib/inventory/stock-service'
import { isPermissionRefusal } from '@/lib/inventory/permission-refusals'
import type { StoreRef } from '@/lib/assistant/actions/execute-manage'
import type { ExecuteOutcome, IngredientPayload, PaymentMethodChangePayload, PaymentMethodPayload } from '@/lib/assistant/actions/kinds'

const PAYMENT_LINK = { label: 'Open Payment methods', path: '/payment-methods' }
const STALE = 'This changed since it was proposed, so nothing was changed. Ask again for a fresh proposal.'

type WriteResult<T> = { success: true; data: T } | { success: false; error: string }

/**
 * The Payment methods screen's own writer (cookie-session client, so RLS and
 * the `store_setup` check are the screen's), then the same pages refreshed.
 */
async function paymentWrite<T>(store: StoreRef, write: () => Promise<T>): Promise<WriteResult<T>> {
  try {
    const data = await write()
    revalidatePath(`/${store.slug}/admin/payment-methods`)
    revalidatePath(`/${store.slug}/admin`)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'write failed' }
  }
}

/** The writers answer with raw database text; the owner reads this instead. */
function paymentFailure(raw: string | undefined, fallback: string): ExecuteOutcome {
  if (raw?.startsWith('Unauthorized')) return { ok: false, error: 'You no longer have permission to change payment methods.' }
  if (raw?.includes('subscription')) return { ok: false, error: 'Your subscription is paused, so changes are on hold.' }
  return { ok: false, error: fallback }
}

export async function executePaymentMethod(store: StoreRef, payload: PaymentMethodPayload): Promise<ExecuteOutcome> {
  const result = await paymentWrite(store, () =>
    createPaymentMethod(store.id, payload.name, payload.details ?? undefined, payload.qrCodeUrl ?? undefined, true, payload.orderTypeIds, payload.requireProof, false),
  )
  if (!result.success) return paymentFailure(result.error, 'The payment method could not be added. Add it on the Payment methods page.')
  const id = (result.data as { id?: string } | undefined)?.id ?? null
  return { ok: true, message: `${payload.name} is now a way to pay at checkout.`, resultRef: id, link: PAYMENT_LINK }
}

export async function executePaymentMethodChange(store: StoreRef, payload: PaymentMethodChangePayload): Promise<ExecuteOutcome> {
  // Same session the writer uses: a row it can't see, it can't change either.
  const { data } = await (await createClient())
    .from('payment_methods')
    .select('updated_at')
    .eq('id', payload.paymentMethodId)
    .eq('tenant_id', store.id)
    .maybeSingle()
  const row = data as { updated_at: string | null } | null
  if (!row) return { ok: false, error: 'That payment method no longer exists.' }
  // Strict, null included: `payment_methods_set_updated_at` stamps every update, so a row
  // first seen with no timestamp that has one now was edited meanwhile.
  if (row.updated_at !== payload.expectedUpdatedAt) return { ok: false, error: STALE }

  const { changes } = payload
  const updates: Parameters<typeof updatePaymentMethod>[2] = {}
  if (changes.name !== null) updates.name = changes.name
  if (changes.details !== null) updates.details = changes.details
  if (changes.qrCodeUrl !== null) updates.qr_code_url = changes.qrCodeUrl
  if (changes.isActive !== null) updates.is_active = changes.isActive
  if (changes.requireProof !== null) updates.require_payment_proof = changes.requireProof

  if (Object.keys(updates).length > 0) {
    const result = await paymentWrite(store, () => updatePaymentMethod(payload.paymentMethodId, store.id, updates))
    if (!result.success) return paymentFailure(result.error, 'The payment method could not be changed. Nothing was changed.')
  }
  const orderTypeIds = changes.orderTypeIds
  if (orderTypeIds !== null) {
    const result = await paymentWrite(store, () => updatePaymentMethodOrderTypes(payload.paymentMethodId, store.id, orderTypeIds))
    if (!result.success) {
      if (Object.keys(updates).length === 0) return paymentFailure(result.error, 'Its order types could not be updated.')
      // The rest IS saved (and updated_at moved, so a retry would be stale): say so as done,
      // with what is left for the owner to do.
      return {
        ok: true,
        message: `${changes.name ?? payload.name} is updated, but its order types could not be changed. Set them on the Payment methods page.`,
        resultRef: payload.paymentMethodId,
        link: PAYMENT_LINK,
      }
    }
  }
  const name = changes.name ?? payload.name
  const status = changes.isActive === null ? '' : changes.isActive ? ' It is on at checkout.' : ' It is hidden at checkout.'
  return { ok: true, message: `${name} is updated.${status}`, resultRef: payload.paymentMethodId, link: PAYMENT_LINK }
}

export async function executeIngredient(store: StoreRef, payload: IngredientPayload): Promise<ExecuteOutcome> {
  const item = await createIngredient(store.id, {
    name: payload.name,
    category: payload.category,
    stock_unit_id: payload.stockUnitId,
    unit_cost: 0,
    is_prep: false,
    reorder_level: payload.reorderLevel,
    is_active: true,
  })
  const link = { label: 'Open Inventory', path: '/inventory' }
  if (payload.openingCount === null || payload.openingCount <= 0) {
    return { ok: true, message: `${payload.name} was added to your ingredients.`, resultRef: item.id, link }
  }
  try {
    // A count, never a direct quantity write: the ledger is the only writer of stock.
    await recordStockMovement(store.id, {
      inventory_item_id: item.id,
      reason: 'stocktake',
      quantity: payload.openingCount,
      unit_id: payload.stockUnitId,
      note: 'Opening count via the Owl assistant',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const why = isPermissionRefusal(message) ? ' Counting stock needs the Inventory permission.' : ''
    return { ok: true, message: `${payload.name} was added, but its opening count was not recorded.${why} Count it in Inventory.`, resultRef: item.id, link }
  }
  return {
    ok: true,
    message: `${payload.name} was added with ${payload.openingCount}${payload.unitLabel ? ` ${payload.unitLabel}` : ''} on hand.`,
    resultRef: item.id,
    link,
  }
}
