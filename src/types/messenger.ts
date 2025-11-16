// Messenger Bot Type Definitions

/**
 * Messenger Session State
 * Tracks where the user is in the conversation flow
 */
export type MessengerSessionState =
  | 'menu'                    // Showing categories
  | 'selecting_item'          // User clicked on an item
  | 'selecting_variation'     // User is selecting variations
  | 'selecting_addons'        // User is selecting addons
  | 'selecting_quantity'      // User is entering quantity
  | 'cart'                    // Viewing cart
  | 'checkout_order_type'     // Selecting order type (dine-in, pickup, delivery)
  | 'checkout_customer'       // Collecting customer information
  | 'checkout_payment'        // Selecting payment method
  | 'checkout_confirm'        // Final confirmation before order creation
  | 'order_confirmed'         // Order created successfully

/**
 * Cart Item in Messenger Session
 * Compatible with web cart but simplified for Messenger storage
 */
export interface MessengerCartItem {
  menu_item_id: string
  menu_item_name: string
  price: number
  quantity: number
  variation?: string  // Variation name for display
  variation_id?: string  // Variation ID if using legacy system
  variations?: { [typeId: string]: { id: string; name: string } }  // New grouped variations
  addons: string[]  // Array of addon names
  addon_ids?: string[]  // Array of addon IDs
  special_instructions?: string
}

/**
 * Checkout State
 * Stores progress through checkout flow
 */
export interface MessengerCheckoutState {
  order_type_id?: string
  order_type_name?: string
  customer_data?: Record<string, string>  // Form field values
  current_field?: string  // Which field we're currently collecting
  payment_method_id?: string
  payment_method_name?: string
  payment_method_details?: string
  payment_method_qr_code_url?: string
  delivery_fee?: number
  lalamove_quotation_id?: string
}

/**
 * Messenger Session
 * Complete session data stored in database
 */
export interface MessengerSession {
  id: string
  psid: string  // Facebook Page-Scoped ID
  tenant_id: string
  cart_data: MessengerCartItem[]
  checkout_state: MessengerCheckoutState
  state: MessengerSessionState
  created_at: string
  updated_at: string
}

/**
 * Facebook Messenger Message Event
 */
export interface MessengerMessageEvent {
  text?: string
  is_echo?: boolean  // Indicates if message is an echo (sent by our bot)
  attachments?: Array<{
    type: string
    payload?: {
      url?: string
      coordinates?: {
        lat: number
        long: number
      }
    }
  }>
  quick_reply?: {
    payload: string
  }
}

/**
 * Facebook Messenger Postback Event
 */
export interface MessengerPostbackEvent {
  payload: string
  title?: string
  referral?: {
    ref: string
    source: string
    type: string
  }
}

/**
 * Facebook Messenger Webhook Entry
 */
export interface MessengerWebhookEntry {
  id: string
  time: number
  messaging: Array<{
    sender: { id: string }
    recipient: { id: string }
    timestamp: number
    message?: MessengerMessageEvent
    postback?: MessengerPostbackEvent
  }>
}

/**
 * Facebook Messenger Webhook Body
 */
export interface MessengerWebhookBody {
  object: 'page'
  entry: MessengerWebhookEntry[]
}

/**
 * Item Selection Context
 * Used during variation/addon selection flow
 */
export interface ItemSelectionContext {
  menu_item_id: string
  selected_variations?: { [typeId: string]: { id: string; name: string } }
  selected_addons?: string[]
  quantity?: number
  special_instructions?: string
}

/**
 * Facebook API Response
 */
export interface FacebookApiResponse {
  recipient_id: string
  message_id?: string
  error?: {
    message: string
    type: string
    code: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

