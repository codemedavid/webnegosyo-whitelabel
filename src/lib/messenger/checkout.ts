/**
 * Checkout Flow Functions
 * Handles order type selection, customer info collection, payment selection, and order creation
 */

import { createClient } from '@/lib/supabase/server'
import { sendText, sendQuickReplies, sendButtonTemplate, sendGenericTemplate } from './facebook-api'
import { formatPrice, getOrderTypeEmoji, isValidUrl } from './utils'
import { updateSession, getOrCreateSession } from './session'
import { createOrderAction } from '@/app/actions/orders'
import { getPaymentMethodsByOrderType } from '@/lib/payment-methods-service'
import type { MessengerCheckoutState } from '@/types/messenger'

interface OrderTypeRow {
  id: string
  name: string
  type: string
}

interface OrderTypeWithFormRow extends OrderTypeRow {
  customer_form?: Array<{
    field_name: string
    field_label: string
    is_required: boolean
    field_type: string
  }> | null
}

interface PaymentMethodRow {
  id: string
  name: string
  details: string | null
  qr_code_url: string | null
}

/**
 * Show order types for selection
 */
export async function showOrderTypes(psid: string, tenantId: string): Promise<void> {
  const supabase = await createClient()

  const { data: orderTypes, error } = await supabase
    .from('order_types')
    .select('id, name, type, is_enabled')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .order('order_index', { ascending: true })

  if (error || !orderTypes || orderTypes.length === 0) {
    await sendText(psid, tenantId, 'No order types available. Please contact the restaurant.')
    return
  }

  const typedOrderTypes = orderTypes as OrderTypeRow[]

  const quickReplies = typedOrderTypes.map(ot => ({
    content_type: 'text' as const,
    title: `${getOrderTypeEmoji(ot.type)} ${ot.name}`,
    payload: `ORDER_TYPE_${ot.id}`,
  }))

  await sendQuickReplies(psid, tenantId, 'Please select order type:', quickReplies)
  await updateSession(psid, {
    state: 'checkout_order_type',
    checkout_state: {},
  })
}

/**
 * Handle order type selection
 */
export async function handleOrderTypeSelection(
  psid: string,
  tenantId: string,
  orderTypeId: string
): Promise<void> {
  const supabase = await createClient()

  const { data: orderType, error } = await supabase
    .from('order_types')
    .select('id, name, type, customer_form')
    .eq('id', orderTypeId)
    .eq('is_enabled', true)
    .single()

  if (error || !orderType) {
    await sendText(psid, tenantId, 'Order type not found or not available.')
    await showOrderTypes(psid, tenantId)
    return
  }

  const typedOrderType = orderType as OrderTypeWithFormRow

  const session = await getOrCreateSession(psid, tenantId)

  // Parse customer form fields
  const customerForm = Array.isArray(typedOrderType.customer_form)
    ? typedOrderType.customer_form
    : []

  // Update checkout state
  const checkoutState: MessengerCheckoutState = {
    ...session.checkout_state,
    order_type_id: typedOrderType.id,
    order_type_name: typedOrderType.name,
    customer_data: {},
  }

  await updateSession(psid, {
    checkout_state: checkoutState,
    state: 'checkout_customer',
  })

  // If no form fields, skip to payment
  if (customerForm.length === 0) {
    await sendText(psid, tenantId, `✅ Order type: ${typedOrderType.name}`)
    await showPaymentMethods(psid, tenantId, orderTypeId)
    return
  }

  // Start collecting customer info
  await sendText(psid, tenantId, `✅ Order type: ${typedOrderType.name}`)
  await collectNextCustomerField(psid, tenantId, customerForm, 0)
}

/**
 * Collect customer information field by field
 */
async function collectNextCustomerField(
  psid: string,
  tenantId: string,
  formFields: Array<{ field_name: string; field_label: string; is_required: boolean; field_type: string }>,
  currentIndex: number
): Promise<void> {
  if (currentIndex >= formFields.length) {
    // All fields collected, move to payment
    const session = await getOrCreateSession(psid, tenantId)
    if (session.checkout_state.order_type_id) {
      await showPaymentMethods(psid, tenantId, session.checkout_state.order_type_id)
    }
    return
  }

  const field = formFields[currentIndex]
  const session = await getOrCreateSession(psid, tenantId)

  await updateSession(psid, {
    checkout_state: {
      ...session.checkout_state,
      current_field: field.field_name,
    },
  })

  const label = field.is_required ? `${field.field_label} *` : field.field_label
  await sendText(psid, tenantId, `Please provide ${label.toLowerCase()}:`)
}

/**
 * Handle customer field input
 */
export async function handleCustomerFieldInput(
  psid: string,
  tenantId: string,
  value: string
): Promise<void> {
  const session = await getOrCreateSession(psid, tenantId)
  const checkoutState = session.checkout_state

  if (!checkoutState.current_field || !checkoutState.order_type_id) {
    await sendText(psid, tenantId, 'Please start checkout again.')
    await showOrderTypes(psid, tenantId)
    return
  }

  // Get form fields to determine next field
  const supabase = await createClient()
  const { data: orderType } = await supabase
    .from('order_types')
    .select('customer_form')
    .eq('id', checkoutState.order_type_id)
    .single()

  const typedOrderType = orderType as OrderTypeWithFormRow | null

  const formFields = Array.isArray(typedOrderType?.customer_form)
    ? typedOrderType.customer_form
    : []

  // Update customer data
  const customerData = {
    ...(checkoutState.customer_data || {}),
    [checkoutState.current_field]: value,
  }

  await updateSession(psid, {
    checkout_state: {
      ...checkoutState,
      customer_data: customerData,
      current_field: undefined,
    },
  })

  // Find current field index
  const currentIndex = formFields.findIndex(
    f => f.field_name === checkoutState.current_field
  )

  // Collect next field
  if (currentIndex >= 0 && currentIndex < formFields.length - 1) {
    await collectNextCustomerField(psid, tenantId, formFields, currentIndex + 1)
  } else {
    // All fields collected
    await sendText(psid, tenantId, '✅ Customer information collected!')
    await showPaymentMethods(psid, tenantId, checkoutState.order_type_id)
  }
}

/**
 * Show payment methods for selected order type
 */
export async function showPaymentMethods(
  psid: string,
  tenantId: string,
  orderTypeId: string
): Promise<void> {
  try {
    const paymentMethods = await getPaymentMethodsByOrderType(orderTypeId, tenantId)

    if (!paymentMethods || paymentMethods.length === 0) {
      await sendText(psid, tenantId, 'No payment methods available. Please contact the restaurant.')
      return
    }

    // If only one payment method, auto-select it
    if (paymentMethods.length === 1) {
      await handlePaymentSelection(psid, tenantId, paymentMethods[0].id)
      return
    }

    // Show payment methods as cards
    // Only include image_url if it's a valid URL (Facebook requires valid absolute URLs)
    const elements = paymentMethods.map(pm => {
      const element: {
        title: string
        subtitle?: string
        image_url?: string
        buttons: Array<{
          type: 'postback'
          title: string
          payload: string
        }>
      } = {
        title: pm.name,
        subtitle: pm.details || undefined,
        buttons: [
          {
            type: 'postback' as const,
            title: 'Select Payment',
            payload: `PAYMENT_${pm.id}`,
          },
        ],
      }

      // Only add image_url if it's a valid URL
      if (isValidUrl(pm.qr_code_url)) {
        element.image_url = pm.qr_code_url
      }

      return element
    })

    await sendGenericTemplate(psid, tenantId, elements)

    await updateSession(psid, { state: 'checkout_payment' })
  } catch (error) {
    console.error('Error showing payment methods:', error)
    await sendText(psid, tenantId, 'Error loading payment methods. Please try again.')
  }
}

/**
 * Handle payment method selection
 */
export async function handlePaymentSelection(
  psid: string,
  tenantId: string,
  paymentMethodId: string
): Promise<void> {
  const supabase = await createClient()

  const { data: paymentMethod, error } = await supabase
    .from('payment_methods')
    .select('id, name, details, qr_code_url')
    .eq('id', paymentMethodId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single()

  if (error || !paymentMethod) {
    await sendText(psid, tenantId, 'Payment method not found.')
    return
  }

  const typedPaymentMethod = paymentMethod as PaymentMethodRow

  const session = await getOrCreateSession(psid, tenantId)

  await updateSession(psid, {
    checkout_state: {
      ...session.checkout_state,
      payment_method_id: typedPaymentMethod.id,
      payment_method_name: typedPaymentMethod.name,
      payment_method_details: typedPaymentMethod.details || undefined,
      payment_method_qr_code_url: typedPaymentMethod.qr_code_url || undefined,
    },
    state: 'checkout_confirm',
  })

  // Show order confirmation
  await confirmOrder(psid, tenantId)
}

/**
 * Show order confirmation and create order
 */
export async function confirmOrder(psid: string, tenantId: string): Promise<void> {
  const session = await getOrCreateSession(psid, tenantId)

  if (session.cart_data.length === 0) {
    await sendText(psid, tenantId, 'Your cart is empty!')
    await updateSession(psid, { state: 'menu' })
    return
  }

  const checkoutState = session.checkout_state

  if (!checkoutState.order_type_id || !checkoutState.payment_method_id) {
    await sendText(psid, tenantId, 'Missing order information. Please start checkout again.')
    await showOrderTypes(psid, tenantId)
    return
  }

  // Calculate total
  const subtotal = session.cart_data.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )
  const deliveryFee = checkoutState.delivery_fee || 0
  const total = subtotal + deliveryFee

  // Build order summary
  let summary = '📋 *Order Summary*\n\n'
  summary += `📋 Order Type: ${checkoutState.order_type_name}\n\n`

  if (checkoutState.customer_data) {
    summary += '👤 *Customer Information:*\n'
    Object.entries(checkoutState.customer_data).forEach(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      summary += `${label}: ${value}\n`
    })
    summary += '\n'
  }

  summary += '📦 *Order Details:*\n'
  session.cart_data.forEach((item, index) => {
    summary += `${index + 1}. ${item.menu_item_name} x${item.quantity}\n`
    if (item.variation) summary += `   ${item.variation}\n`
    if (item.addons && item.addons.length > 0) {
      summary += `   Add-ons: ${item.addons.join(', ')}\n`
    }
    summary += `   ${formatPrice(item.price * item.quantity)}\n\n`
  })

  summary += `💰 Subtotal: ${formatPrice(subtotal)}\n`
  if (deliveryFee > 0) {
    summary += `🚚 Delivery Fee: ${formatPrice(deliveryFee)}\n`
  }
  summary += `💰 *Total: ${formatPrice(total)}*\n\n`
  summary += `💳 Payment: ${checkoutState.payment_method_name}`

  await sendText(psid, tenantId, summary)

  // Show QR code if available
  if (checkoutState.payment_method_qr_code_url) {
    await sendButtonTemplate(psid, tenantId, 'Payment QR Code:', [
      {
        type: 'web_url',
        title: 'View QR Code',
        url: checkoutState.payment_method_qr_code_url,
      },
    ])
  }

  // Confirmation buttons
  await sendButtonTemplate(psid, tenantId, 'Confirm your order?', [
    { type: 'postback', title: '✅ Confirm Order', payload: 'CONFIRM_ORDER' },
    { type: 'postback', title: '❌ Cancel', payload: 'CANCEL_CHECKOUT' },
  ])
}

/**
 * Create order from Messenger checkout
 */
export async function createOrderFromMessenger(psid: string, tenantId: string): Promise<void> {
  const session = await getOrCreateSession(psid, tenantId)

  if (session.cart_data.length === 0) {
    await sendText(psid, tenantId, 'Your cart is empty!')
    return
  }

  const checkoutState = session.checkout_state

  if (!checkoutState.order_type_id || !checkoutState.payment_method_id) {
    await sendText(psid, tenantId, 'Missing order information. Please start checkout again.')
    await showOrderTypes(psid, tenantId)
    return
  }

  // Convert cart items to order items format
  const orderItems = session.cart_data.map(item => ({
    menu_item_id: item.menu_item_id,
    menu_item_name: item.menu_item_name,
    variation: item.variation || undefined,
    addons: item.addons || [],
    quantity: item.quantity,
    price: item.price,
    subtotal: item.price * item.quantity,
    special_instructions: item.special_instructions,
  }))

  // Extract customer info
  const customerData = checkoutState.customer_data || {}
  const customerInfo = {
    name: customerData.customer_name || customerData.name || undefined,
    contact: customerData.customer_phone || customerData.phone || customerData.customer_email || customerData.email || undefined,
  }

  try {
    const result = await createOrderAction(
      tenantId,
      orderItems,
      customerInfo,
      checkoutState.order_type_id,
      customerData,
      checkoutState.delivery_fee,
      checkoutState.lalamove_quotation_id,
      checkoutState.payment_method_id,
      checkoutState.payment_method_name,
      checkoutState.payment_method_details,
      checkoutState.payment_method_qr_code_url
    )

    if (result.success && result.data) {
      // Clear cart and checkout state
      await updateSession(psid, {
        cart_data: [],
        checkout_state: {},
        state: 'order_confirmed',
      })

      await sendText(psid, tenantId, '✅ *Order confirmed!*\n\nYour order has been received. We will prepare it shortly. Thank you!')
      
      // Send order notification to admin (optional - via existing messenger integration)
      // This can be enhanced to send to the tenant's messenger page
    } else {
      await sendText(psid, tenantId, `❌ Error creating order: ${result.error || 'Unknown error'}\n\nPlease try again or contact the restaurant.`)
    }
  } catch (error) {
    console.error('Error creating order:', error)
    await sendText(psid, tenantId, '❌ An error occurred while creating your order. Please try again or contact the restaurant.')
  }
}

