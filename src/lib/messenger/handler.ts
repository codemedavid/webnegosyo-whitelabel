/**
 * Main Messenger Event Handler
 * Routes messages and postbacks based on session state
 */

import { sendText } from './facebook-api'
import { getOrCreateSession, resolveTenant, updateSession } from './session'
import { showCategories, showMenuItems, showItemDetails } from './menu'
import { showCart, addToCart as addItemToCart, clearCart } from './cart'
import { showOrderTypes, handleOrderTypeSelection, handleCustomerFieldInput, handlePaymentSelection, createOrderFromMessenger } from './checkout'
import {
  handleVariationSelection,
  handleAddonSelection,
  finishAddonSelection,
  handleQuantitySelection,
  skipVariation,
} from './selection'
import type { MessengerMessageEvent, MessengerPostbackEvent } from '@/types/messenger'

/**
 * Main event handler - routes all Messenger events
 */
export async function handleMessengerEvent(
  psid: string,
  eventType: 'message' | 'postback',
  event: MessengerMessageEvent | MessengerPostbackEvent,
  pageId?: string
): Promise<void> {
  try {
    // Resolve tenant (using pageId if available)
    const tenantId = await resolveTenant(psid, pageId)
    if (!tenantId) {
      console.error(`[Messenger] Cannot resolve tenant for PSID: ${psid}, pageId: ${pageId}`)
      // Cannot send message without tenant ID - skip
      return
    }

    console.log(`[Messenger] Processing ${eventType} for PSID: ${psid}, tenantId: ${tenantId}`)

    // Get or create session
    const session = await getOrCreateSession(psid, tenantId)

    // Handle message events
    if (eventType === 'message') {
      await handleMessage(psid, tenantId, session, event as MessengerMessageEvent)
      return
    }

    // Handle postback events
    if (eventType === 'postback') {
      await handlePostback(psid, tenantId, session, event as MessengerPostbackEvent)
      return
    }
  } catch (error) {
    console.error('[Messenger] Error handling Messenger event:', error)
    console.error('[Messenger] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    try {
      // Try to resolve tenant for error message
      const tenantId = await resolveTenant(psid, pageId)
      if (tenantId) {
        await sendText(psid, tenantId, 'Sorry, an error occurred. Please try again or contact the restaurant.')
      }
    } catch (sendError) {
      console.error('[Messenger] Error sending error message:', sendError)
    }
  }
}

/**
 * Handle text message events
 */
async function handleMessage(
  psid: string,
  tenantId: string,
  session: Awaited<ReturnType<typeof getOrCreateSession>>,
  event: MessengerMessageEvent
): Promise<void> {
  const text = (event.text || '').toLowerCase().trim()
  const quickReplyPayload = event.quick_reply?.payload

  // Handle quick reply payloads first (they override text commands)
  if (quickReplyPayload) {
    await handlePostback(psid, tenantId, session, { payload: quickReplyPayload })
    return
  }

  // Handle text commands based on state
  if (session.state === 'checkout_customer') {
    // Collecting customer information
    await handleCustomerFieldInput(psid, tenantId, event.text || '')
    return
  }

  // General commands (work in any state)
  if (text === 'menu' || text === 'start' || text === 'hi' || text === 'hello' || text === 'help') {
    await updateSession(psid, { state: 'menu' })
    await showCategories(psid, tenantId, session)
    return
  }

  if (text === 'cart') {
    await showCart(psid, tenantId)
    return
  }

  if (text === 'clear' || text === 'reset') {
    await clearCart(psid, tenantId)
    await showCategories(psid, tenantId, session)
    return
  }

  // Default: show menu (for any other message, including first message)
  // Send welcome message if this is their first interaction
  const isFirstMessage = session.state === 'menu' && session.cart_data.length === 0 && Object.keys(session.checkout_state).length === 0
  
  if (isFirstMessage && !text) {
    // Only send welcome on actual first message (not when user types a command)
    await sendText(psid, tenantId, '👋 Welcome! Here\'s our menu:')
  }
  
  await updateSession(psid, { state: 'menu' })
  await showCategories(psid, tenantId, session)
}

/**
 * Handle postback events (button clicks, quick replies)
 */
async function handlePostback(
  psid: string,
  tenantId: string,
  session: Awaited<ReturnType<typeof getOrCreateSession>>,
  event: MessengerPostbackEvent
): Promise<void> {
  const payload = event.payload || ''

  try {
    // Navigation
    if (payload === 'SHOW_CATEGORIES' || payload === 'BACK_TO_CATEGORIES') {
      await updateSession(psid, { state: 'menu' })
      await showCategories(psid, tenantId, session)
      return
    }

    if (payload === 'VIEW_CART') {
      await showCart(psid, tenantId)
      return
    }

    if (payload === 'CLEAR_CART') {
      await clearCart(psid, tenantId)
      await showCategories(psid, tenantId, session)
      return
    }

    // Menu browsing
    if (payload.startsWith('CATEGORY_')) {
      const categoryId = payload.replace('CATEGORY_', '')
      await showMenuItems(psid, tenantId, categoryId)
      return
    }

    if (payload.startsWith('VIEW_ITEM_')) {
      const itemId = payload.replace('VIEW_ITEM_', '')
      await showItemDetails(psid, tenantId, itemId)
      return
    }

    // Item selection and customization
    if (payload.startsWith('ADD_')) {
      const itemId = payload.replace('ADD_', '')
      // Add with default (first variation or no variation)
      await addItemToCart(psid, tenantId, itemId, 1)
      return
    }

    if (payload.startsWith('SELECT_VARIATION_')) {
      const parts = payload.replace('SELECT_VARIATION_', '').split('_')
      if (parts.length === 2) {
        await handleVariationSelection(psid, tenantId, parts[0], parts[1])
      }
      return
    }

    if (payload.startsWith('SKIP_VARIATION_')) {
      const itemId = payload.replace('SKIP_VARIATION_', '')
      await skipVariation(psid, tenantId, itemId)
      return
    }

    if (payload.startsWith('SELECT_ADDON_')) {
      const parts = payload.replace('SELECT_ADDON_', '').split('_')
      if (parts.length === 2) {
        await handleAddonSelection(psid, tenantId, parts[0], parts[1])
      }
      return
    }

    if (payload.startsWith('SHOW_ADDONS_')) {
      const itemId = payload.replace('SHOW_ADDONS_', '')
      // Re-show addon selection (could be enhanced to remember selected ones)
      await showItemDetails(psid, tenantId, itemId)
      return
    }

    if (payload.startsWith('DONE_ADDONS_')) {
      const itemId = payload.replace('DONE_ADDONS_', '')
      await finishAddonSelection(psid, tenantId, itemId)
      return
    }

    if (payload.startsWith('SET_QUANTITY_')) {
      const parts = payload.replace('SET_QUANTITY_', '').split('_')
      if (parts.length === 2) {
        const itemId = parts[0]
        const quantity = parseInt(parts[1], 10)
        if (!isNaN(quantity) && quantity > 0) {
          await handleQuantitySelection(psid, tenantId, itemId, quantity)
        }
      }
      return
    }

    // Checkout flow
    if (payload === 'CHECKOUT') {
      await showOrderTypes(psid, tenantId)
      return
    }

    if (payload.startsWith('ORDER_TYPE_')) {
      const orderTypeId = payload.replace('ORDER_TYPE_', '')
      await handleOrderTypeSelection(psid, tenantId, orderTypeId)
      return
    }

    if (payload.startsWith('PAYMENT_')) {
      const paymentMethodId = payload.replace('PAYMENT_', '')
      await handlePaymentSelection(psid, tenantId, paymentMethodId)
      return
    }

    if (payload === 'CONFIRM_ORDER') {
      await createOrderFromMessenger(psid, tenantId)
      return
    }

    if (payload === 'CANCEL_CHECKOUT') {
      await updateSession(psid, {
        checkout_state: {},
        state: 'cart',
      })
      await showCart(psid, tenantId)
      return
    }

    // Unknown payload
    console.warn('Unknown postback payload:', payload)
    await sendText(psid, tenantId, 'Unknown action. Please try again.')
    await showCategories(psid, tenantId, session)
  } catch (error) {
    console.error('Error handling postback:', error)
    await sendText(psid, tenantId, 'Sorry, an error occurred. Please try again.')
  }
}

