/**
 * Cart Management Functions
 * Handles cart display, item management, and calculations
 */

import { createClient } from '@/lib/supabase/server'
import { sendText, sendButtonTemplate } from './facebook-api'
import { formatPrice } from './utils'
import { updateSession, getOrCreateSession } from './session'

/**
 * Show cart with all items and totals
 */
export async function showCart(psid: string, tenantId: string): Promise<void> {
  const session = await getOrCreateSession(psid, tenantId)

  if (session.cart_data.length === 0) {
    await sendText(psid, tenantId, '🛒 Your cart is empty!')
    await updateSession(psid, { state: 'menu' })
    return
  }

  let message = '🛒 *Your Cart:*\n\n'
  let total = 0

  session.cart_data.forEach((item, index) => {
    const itemTotal = item.price * item.quantity
    total += itemTotal

    message += `${index + 1}. ${item.menu_item_name} x${item.quantity}\n`

    if (item.variation) {
      message += `   ${item.variation}\n`
    }

    if (item.addons && item.addons.length > 0) {
      message += `   Add-ons: ${item.addons.join(', ')}\n`
    }

    if (item.special_instructions) {
      message += `   Note: ${item.special_instructions}\n`
    }

    message += `   ${formatPrice(itemTotal)}\n\n`
  })

  message += `💰 *Total: ${formatPrice(total)}*`

  await sendText(psid, tenantId, message)

  await sendButtonTemplate(psid, tenantId, 'Ready to order?', [
    { type: 'postback', title: '✅ Checkout', payload: 'CHECKOUT' },
    { type: 'postback', title: '➕ Add More', payload: 'SHOW_CATEGORIES' },
    { type: 'postback', title: '🗑️ Clear Cart', payload: 'CLEAR_CART' },
  ])

  await updateSession(psid, { state: 'cart' })
}

/**
 * Add item to cart with selected variations/addons
 */
export async function addToCart(
  psid: string,
  tenantId: string,
  itemId: string,
  quantity: number = 1,
  variation?: { id: string; name: string; price_modifier?: number },
  addons: Array<{ id: string; name: string; price?: number }> = [],
  specialInstructions?: string
): Promise<void> {
  const supabase = await createClient()

  // Get item details
  const { data: item, error } = await supabase
    .from('menu_items')
    .select('id, name, price, discounted_price')
    .eq('id', itemId)
    .eq('is_available', true)
    .single()

  if (error || !item) {
    await sendText(psid, tenantId, 'Item not found or no longer available.')
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemData = item as any
  const session = await getOrCreateSession(psid, tenantId)
  const cartData = [...session.cart_data]

  // Calculate price
  let price = Number(itemData.discounted_price || itemData.price)
  if (variation?.price_modifier) {
    price += variation.price_modifier
  }
  if (addons.length > 0) {
    price += addons.reduce((sum, addon) => sum + (addon.price || 0), 0)
  }

  // Check if same item with same configuration already exists
  const existingIndex = cartData.findIndex(cartItem => {
    if (cartItem.menu_item_id !== itemId) return false
    if (cartItem.variation !== variation?.name) return false
    if (cartItem.addons?.join(',') !== addons.map(a => a.name).join(',')) return false
    return true
  })

  if (existingIndex >= 0) {
    // Update quantity of existing item
    cartData[existingIndex].quantity += quantity
  } else {
    // Add new item
    cartData.push({
      menu_item_id: itemId,
      menu_item_name: itemData.name,
      price,
      quantity,
      variation: variation?.name,
      variation_id: variation?.id,
      addons: addons.map(a => a.name),
      addon_ids: addons.map(a => a.id),
      special_instructions: specialInstructions,
    })
  }

  await updateSession(psid, {
    cart_data: cartData,
    state: 'menu',
    checkout_state: {}, // Clear checkout state when adding to cart
  })

  await sendText(psid, tenantId, `✅ Added "${itemData.name}" to cart!`)

  // Ask what next
  await sendButtonTemplate(psid, tenantId, 'What would you like to do?', [
    { type: 'postback', title: '🛒 View Cart', payload: 'VIEW_CART' },
    { type: 'postback', title: '➕ Add More', payload: 'SHOW_CATEGORIES' },
    { type: 'postback', title: '✅ Checkout', payload: 'CHECKOUT' },
  ])
}

/**
 * Remove item from cart by index
 */
export async function removeFromCart(
  psid: string,
  tenantId: string,
  itemIndex: number
): Promise<void> {
  const session = await getOrCreateSession(psid, tenantId)

  if (itemIndex < 0 || itemIndex >= session.cart_data.length) {
    await sendText(psid, tenantId, 'Invalid item number.')
    return
  }

  const cartData = [...session.cart_data]
  const removedItem = cartData.splice(itemIndex, 1)[0]

  await updateSession(psid, { cart_data: cartData })

  await sendText(psid, tenantId, `✅ Removed "${removedItem?.menu_item_name || 'item'}" from cart.`)
  
  if (cartData.length === 0) {
    await sendText(psid, tenantId, 'Your cart is now empty.')
    await updateSession(psid, { state: 'menu' })
  } else {
    await showCart(psid, tenantId)
  }
}

/**
 * Clear entire cart
 */
export async function clearCart(psid: string, tenantId: string): Promise<void> {
  await updateSession(psid, {
    cart_data: [],
    checkout_state: {},
    state: 'menu',
  })
  
  await sendText(psid, tenantId, '✅ Cart cleared!')
}

