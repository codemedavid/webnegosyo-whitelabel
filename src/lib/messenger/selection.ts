/**
 * Variation and Addon Selection Flow
 * Handles the flow of selecting variations, addons, and quantity
 */

import { createClient } from '@/lib/supabase/server'
import type { MessengerCheckoutState } from '@/types/messenger'
import { sendQuickReplies, sendText, sendButtonTemplate } from './facebook-api'
import { formatPrice } from './utils'
import { updateSession, getOrCreateSession } from './session'
import { addToCart } from './cart'

interface VariationSelection {
  id: string
  name: string
  price_modifier?: number
}

interface MenuItemRow {
  id: string
  name: string
  variations?: VariationSelection[] | null
  addons?: Array<{ id: string; name: string; price?: number }> | null
}

interface CurrentItemSelection {
  item_id: string
  variation?: VariationSelection
  addons?: Array<{ id: string; name: string; price?: number }>
}

interface CheckoutStateWithSelection extends MessengerCheckoutState {
  current_item_selection?: CurrentItemSelection
}

/**
 * Handle variation selection for an item
 */
export async function handleVariationSelection(
  psid: string,
  tenantId: string,
  itemId: string,
  variationId: string
): Promise<void> {
  const supabase = await createClient()

  // Get item with variations
  const { data: item, error } = await supabase
    .from('menu_items')
    .select('id, name, variations, addons')
    .eq('id', itemId)
    .single()

  if (error || !item) {
    await sendText(psid, tenantId, 'Item not found or no longer available.')
    return
  }

  const typedItem = item as MenuItemRow

  const variations: VariationSelection[] = Array.isArray(typedItem.variations)
    ? typedItem.variations
    : []
  const selectedVariation = variations.find((v) => v.id === variationId)

  if (!selectedVariation) {
    await sendText(psid, tenantId, 'Variation not found.')
    return
  }

  const session = await getOrCreateSession(psid, tenantId)

  // Store selected variation in checkout state temporarily
  const currentSelection: CurrentItemSelection = {
    item_id: itemId,
    variation: selectedVariation,
  }

  const checkoutStateWithSelection: CheckoutStateWithSelection = {
    ...(session.checkout_state as CheckoutStateWithSelection),
    current_item_selection: currentSelection,
  }

  await updateSession(psid, {
    state: 'selecting_addons',
    checkout_state: checkoutStateWithSelection as MessengerCheckoutState,
  })

  // Check for addons
  const addons = Array.isArray(typedItem.addons) ? typedItem.addons : []

  if (addons.length > 0) {
    const quickReplies = addons.slice(0, 10).map((addon: { id: string; name: string; price?: number }) => ({
      content_type: 'text' as const,
      title: `${addon.name}${addon.price ? ` (+${formatPrice(addon.price)})` : ''}`,
      payload: `SELECT_ADDON_${itemId}_${addon.id}`,
    }))

    quickReplies.push({
      content_type: 'text',
      title: 'No Add-ons',
      payload: `DONE_ADDONS_${itemId}`,
    })

    await sendQuickReplies(psid, tenantId, `Selected: ${selectedVariation.name}\n\nSelect add-ons (optional):`, quickReplies)
  } else {
    // No addons, ask for quantity
    await sendText(psid, tenantId, `✅ Selected: ${selectedVariation.name}`)
    await askForQuantity(psid, tenantId, itemId)
  }
}

/**
 * Handle addon selection (can select multiple)
 */
export async function handleAddonSelection(
  psid: string,
  tenantId: string,
  itemId: string,
  addonId: string
): Promise<void> {
  const supabase = await createClient()

  const { data: item, error } = await supabase
    .from('menu_items')
    .select('id, name, addons')
    .eq('id', itemId)
    .single()

  if (error || !item) {
    await sendText(psid, tenantId, 'Item not found.')
    return
  }

  const typedItem = item as MenuItemRow

  const addons = Array.isArray(typedItem.addons) ? typedItem.addons : []
  const selectedAddon = addons.find((a: { id: string }) => a.id === addonId)

  if (!selectedAddon) {
    await sendText(psid, tenantId, 'Addon not found.')
    return
  }

  const session = await getOrCreateSession(psid, tenantId)

  // Get current selection from checkout state
  const checkoutState = session.checkout_state as CheckoutStateWithSelection
  const currentSelection: CurrentItemSelection =
    checkoutState.current_item_selection || {
      item_id: itemId,
      addons: [],
    }

  // Add addon if not already selected
  const selectedAddons = Array.isArray(currentSelection.addons) ? [...currentSelection.addons] : []
  if (!selectedAddons.find((a: { id: string }) => a.id === addonId)) {
    selectedAddons.push(selectedAddon)
  }

  const checkoutStateWithSelection: CheckoutStateWithSelection = {
    ...(session.checkout_state as CheckoutStateWithSelection),
    current_item_selection: {
      ...currentSelection,
      addons: selectedAddons,
    },
  }

  await updateSession(psid, {
    checkout_state: checkoutStateWithSelection as MessengerCheckoutState,
  })

  const addonNames = selectedAddons.map((a: { name: string }) => a.name).join(', ')
  await sendText(psid, tenantId, `✅ Selected add-ons: ${addonNames || 'None'}`)

  // Ask if want more addons or done
  await sendButtonTemplate(psid, tenantId, 'Select more add-ons or continue?', [
    { type: 'postback', title: '➕ More Add-ons', payload: `SHOW_ADDONS_${itemId}` },
    { type: 'postback', title: '✅ Done', payload: `DONE_ADDONS_${itemId}` },
  ])
}

/**
 * Finish addon selection and ask for quantity
 */
export async function finishAddonSelection(psid: string, tenantId: string, itemId: string): Promise<void> {
  await askForQuantity(psid, tenantId, itemId)
}

/**
 * Ask for quantity
 */
export async function askForQuantity(psid: string, tenantId: string, itemId: string): Promise<void> {
  const quantityQuickReplies = Array.from({ length: 10 }, (_, i) => ({
    content_type: 'text' as const,
    title: `${i + 1}`,
    payload: `SET_QUANTITY_${itemId}_${i + 1}`,
  }))

  await sendQuickReplies(psid, tenantId, 'How many would you like?', quantityQuickReplies)
  await updateSession(psid, { state: 'selecting_quantity' })
}

/**
 * Handle quantity selection and add to cart
 */
export async function handleQuantitySelection(
  psid: string,
  tenantId: string,
  itemId: string,
  quantity: number
): Promise<void> {
  const session = await getOrCreateSession(psid, tenantId)
  const checkoutState = session.checkout_state as CheckoutStateWithSelection
  const currentSelection = checkoutState.current_item_selection

  if (!currentSelection || currentSelection.item_id !== itemId) {
    await sendText(psid, tenantId, 'Please select the item again.')
    return
  }

  // Extract selection details
  const variation = currentSelection.variation
  const addons = Array.isArray(currentSelection.addons) ? currentSelection.addons : []

  // Add to cart
  await addToCart(
    psid,
    tenantId,
    itemId,
    quantity,
    variation,
    addons
  )

  // Clear current selection
  const clearedCheckoutState: CheckoutStateWithSelection = {
    ...(session.checkout_state as CheckoutStateWithSelection),
    current_item_selection: undefined,
  }

  await updateSession(psid, {
    checkout_state: clearedCheckoutState as MessengerCheckoutState,
  })
}

/**
 * Skip variation selection (if optional)
 */
export async function skipVariation(psid: string, tenantId: string, itemId: string): Promise<void> {
  const supabase = await createClient()

  const { data: item, error } = await supabase
    .from('menu_items')
    .select('id, name, addons')
    .eq('id', itemId)
    .single()

  if (error || !item) {
    await sendText(psid, tenantId, 'Item not found.')
    return
  }

  const typedItem = item as MenuItemRow

  const session = await getOrCreateSession(psid, tenantId)

  const checkoutStateWithSelection: CheckoutStateWithSelection = {
    ...(session.checkout_state as CheckoutStateWithSelection),
    current_item_selection: {
      item_id: itemId,
      addons: [],
    },
  }

  await updateSession(psid, {
    state: 'selecting_addons',
    checkout_state: checkoutStateWithSelection as MessengerCheckoutState,
  })

  const addons = Array.isArray(typedItem.addons) ? typedItem.addons : []

  if (addons.length > 0) {
    const quickReplies = addons.slice(0, 10).map((addon: { id: string; name: string; price?: number }) => ({
      content_type: 'text' as const,
      title: `${addon.name}${addon.price ? ` (+${formatPrice(addon.price)})` : ''}`,
      payload: `SELECT_ADDON_${itemId}_${addon.id}`,
    }))

    quickReplies.push({
      content_type: 'text',
      title: 'No Add-ons',
      payload: `DONE_ADDONS_${itemId}`,
    })

    await sendQuickReplies(psid, tenantId, 'Select add-ons (optional):', quickReplies)
  } else {
    await askForQuantity(psid, tenantId, itemId)
  }
}

