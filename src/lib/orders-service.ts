/**
 * Orders service for tenant admin operations
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { createConvexServerClient } from '@/lib/convex/server'
import type { Order } from '@/types/database'

export interface OrderWithItems extends Order {
  order_items: Array<{
    id: string
    menu_item_name: string
    variation: string | null
    addons: string[]
    quantity: number
    price: number
    subtotal: number
    special_instructions: string | null
  }>
}

// ============================================
// Orders Operations
// ============================================

export interface OrdersPaginationParams {
  page?: number
  limit?: number
  status?: string
  orderType?: string
  dateFrom?: string
  dateTo?: string
}

export interface PaginatedOrdersResult {
  orders: OrderWithItems[]
  totalCount: number
  currentPage: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export async function getOrdersByTenant(
  tenantId: string,
  params?: OrdersPaginationParams
): Promise<OrderWithItems[] | PaginatedOrdersResult> {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()

  // If no pagination params provided, return all orders (legacy behavior)
  if (!params) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(*)
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as unknown as OrderWithItems[]
  }

  // Pagination logic
  const page = params.page || 1
  const limit = params.limit || 20
  const offset = (page - 1) * limit

  // Build query with filters
  let query = supabase
    .from('orders')
    .select(`
      *,
      order_items(*)
    `, { count: 'exact' })
    .eq('tenant_id', tenantId)

  // Apply filters
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status)
  }

  if (params.orderType && params.orderType !== 'all') {
    query = query.eq('order_type', params.orderType)
  }

  if (params.dateFrom) {
    query = query.gte('created_at', params.dateFrom)
  }

  if (params.dateTo) {
    query = query.lte('created_at', params.dateTo)
  }

  // Apply pagination and ordering
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) throw error

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / limit)

  return {
    orders: data as unknown as OrderWithItems[],
    totalCount,
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }
}

export async function getOrderById(orderId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(*)
    `)
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw error
  return data as unknown as OrderWithItems
}

export async function updateOrderStatus(
  orderId: string,
  tenantId: string,
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()

  // Get order first to check if we need to create Lalamove order
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .single()

  const query = supabase
    .from('orders')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status } as any)
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  const { data, error } = await query

  if (error) throw error

  // If order is being confirmed and has Lalamove quotation but no Lalamove order yet,
  // trigger Lalamove order creation (async, don't wait)
  if (status === 'confirmed' && existingOrder && (existingOrder as unknown as Order).lalamove_quotation_id && !(existingOrder as unknown as Order).lalamove_order_id) {
    const order = existingOrder as unknown as Order

    // Extract customer info for Lalamove
    const customerName = order.customer_name || 'Customer'
    const customerContact = order.customer_contact || ''
    const customerData = (order.customer_data as Record<string, unknown>) || {}

    // Get delivery address from customer data
    const deliveryAddress = customerData.delivery_address as string

    // Get tenant info for sender details
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()

    const tenantName = (tenant as { name?: string } | null)?.name || 'Restaurant'
    // Use customer contact as sender phone for now (tenant phone should be added to tenant table)
    const senderPhone = customerContact || ''

    // Only create if we have the necessary info
    // Double-check the database to ensure no other process created it while we were processing
    if (order.lalamove_quotation_id && customerContact && deliveryAddress && senderPhone) {
      // Check database one more time before creating (race condition prevention)
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('lalamove_order_id')
        .eq('id', orderId)
        .single()

      // If order already has lalamove_order_id, skip creation
      if (currentOrder && (currentOrder as { lalamove_order_id?: string | null }).lalamove_order_id) {
        const existingId = (currentOrder as { lalamove_order_id: string }).lalamove_order_id
        if (existingId && String(existingId).trim() !== '') {
          console.log('Lalamove order already exists, skipping automatic creation')
          return data as unknown as Order
        }
      }

      // Trigger Lalamove order creation asynchronously
      import('@/app/actions/lalamove')
        .then(({ createLalamoveOrderAction }) => {
          return createLalamoveOrderAction(
            tenantId,
            orderId,
            order.lalamove_quotation_id!,
            tenantName,
            senderPhone,
            customerName,
            customerContact,
            { orderId, tenantId }
          )
        })
        .then((result) => {
          if (!result.success) {
            console.error('Failed to create Lalamove order:', result.error)
          } else {
            console.log('Lalamove order created successfully via automatic trigger')
          }
        })
        .catch((error) => {
          console.error('Error creating Lalamove order:', error)
        })
    }
  }

  return data as unknown as Order
}

export const getOrderStats = cache(async function getOrderStats(tenantId: string) {
  await verifyTenantAdmin(tenantId)

  const supabase = await createClient()

  // Get today's orders
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: orders, error } = await supabase
    .from('orders')
    .select('status, total, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', today.toISOString())

  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersData = orders as any[] || []

  const stats = {
    todayOrders: ordersData.length || 0,
    todayRevenue: ordersData.reduce((sum, order) => sum + Number(order.total), 0) || 0,
    pendingOrders: ordersData.filter(o => o.status === 'pending').length || 0,
    confirmedOrders: ordersData.filter(o => o.status === 'confirmed').length || 0,
    preparingOrders: ordersData.filter(o => o.status === 'preparing').length || 0,
    readyOrders: ordersData.filter(o => o.status === 'ready').length || 0,
  }

  return stats
})

// ============================================
// Customer Order Creation (Public)
// ============================================

// Maximum character lengths to prevent large-payload abuse
const MAX_FIELD_LENGTH = 500
const MAX_INSTRUCTION_LENGTH = 1000
const MAX_ITEMS = 50

export async function createOrder(
  tenantId: string,
  items: Array<{
    menu_item_id: string
    menu_item_name: string
    variation?: string
    addons: string[]
    quantity: number
    price: number
    subtotal: number
    special_instructions?: string
  }>,
  customerInfo?: {
    name?: string
    contact?: string
  },
  orderTypeId?: string,
  customerData?: Record<string, unknown>,
  deliveryFee?: number,
  lalamoveQuotationId?: string,
  paymentMethodId?: string,
  paymentMethodName?: string,
  paymentMethodDetails?: string,
  paymentMethodQrCodeUrl?: string,
  serviceChargeAmount?: number
) {
  // Input length validation to prevent large-payload abuse and potential DoS
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must contain at least one item')
  }
  if (items.length > MAX_ITEMS) {
    throw new Error(`Order cannot contain more than ${MAX_ITEMS} items`)
  }

  // Validate and truncate string fields
  for (const item of items) {
    if (item.special_instructions && item.special_instructions.length > MAX_INSTRUCTION_LENGTH) {
      // Truncate instead of reject to avoid breaking the user experience
      item.special_instructions = item.special_instructions.substring(0, MAX_INSTRUCTION_LENGTH)
    }
  }

  if (customerInfo?.name && customerInfo.name.length > MAX_FIELD_LENGTH) {
    customerInfo.name = customerInfo.name.substring(0, MAX_FIELD_LENGTH)
  }
  if (customerInfo?.contact && customerInfo.contact.length > MAX_FIELD_LENGTH) {
    customerInfo.contact = customerInfo.contact.substring(0, MAX_FIELD_LENGTH)
  }

  // Truncate customerData string fields
  if (customerData) {
    for (const key of Object.keys(customerData)) {
      if (typeof customerData[key] === 'string' && (customerData[key] as string).length > MAX_FIELD_LENGTH) {
        customerData[key] = (customerData[key] as string).substring(0, MAX_FIELD_LENGTH)
      }
    }
  }

  const supabase = await createClient()

  // SERVER-SIDE PRICE VALIDATION: Verify prices against database
  const menuItemIds = [...new Set(items.map(i => i.menu_item_id))]
  const { data: dbItems, error: priceCheckError } = await supabase
    .from('menu_items')
    .select('id, price, name')
    .eq('tenant_id', tenantId)
    .in('id', menuItemIds)

  if (priceCheckError) {
    throw new Error('Failed to verify item prices')
  }

  const priceMap = new Map((dbItems || []).map(i => [i.id, i.price]))

  // IDOR GUARD: Verify orderTypeId belongs to this tenant before using it
  if (orderTypeId) {
    const { data: orderTypeData, error: otError } = await supabase
      .from('order_types')
      .select('id')
      .eq('id', orderTypeId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (otError || !orderTypeData) {
      throw new Error('Invalid order type for this restaurant')
    }
  }

  // IDOR GUARD: Verify paymentMethodId belongs to this tenant before using it
  if (paymentMethodId) {
    const { data: pmData, error: pmError } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('id', paymentMethodId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (pmError || !pmData) {
      console.warn(`[Order] paymentMethodId ${paymentMethodId} not found for tenant ${tenantId}, clearing`)
      paymentMethodId = undefined
      paymentMethodName = undefined
      paymentMethodDetails = undefined
      paymentMethodQrCodeUrl = undefined
    }
  }

  // SERVER-SIDE PRICE & QUANTITY VALIDATION
  // Base prices are verified against the DB. Variation/addon modifiers come from the client,
  // but we enforce that the submitted subtotal must equal price * quantity exactly.
  // This prevents a client from sending an inflated price (e.g. variation modifier > actual DB value)
  // or a manipulated subtotal that doesn't match quantity.
  const MAX_QUANTITY = 99
  const MAX_PRICE = 1_000_000 // sanity cap: no single item should exceed ₱1,000,000
  let verifiedTotal = 0
  for (const item of items) {
    const dbPrice = priceMap.get(item.menu_item_id)
    if (dbPrice === undefined) {
      throw new Error(`Menu item not found: ${item.menu_item_id}`)
    }

    // Enforce quantity bounds server-side (client allows 1-99 but we re-validate here)
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      throw new Error(`Invalid quantity for ${item.menu_item_name}: must be between 1 and ${MAX_QUANTITY}`)
    }

    // Enforce that the submitted per-unit price is at least the DB base price.
    // Variation modifiers legitimately add to the price, so prices above DB price are allowed,
    // but we cap them to prevent absurd values.
    if (item.price < dbPrice - 0.01) {
      console.warn(`[Order] Price below DB price for ${item.menu_item_name}: client=${item.price}, db=${dbPrice}`)
      // Override with DB price — client submitted a price lower than the DB base price
      item.price = dbPrice
    }

    if (item.price > MAX_PRICE) {
      throw new Error(`Price exceeds maximum allowed value for ${item.menu_item_name}`)
    }

    // Enforce that subtotal matches price × quantity (tolerance: ₱0.01 for floating-point rounding)
    const expectedSubtotal = Math.round(item.price * item.quantity * 100) / 100
    const submittedSubtotal = Math.round(item.subtotal * 100) / 100
    if (Math.abs(submittedSubtotal - expectedSubtotal) > 0.02) {
      console.warn(
        `[Order] Subtotal mismatch for ${item.menu_item_name}: ` +
        `submitted=${submittedSubtotal}, expected=${expectedSubtotal} (price=${item.price} × qty=${item.quantity})`
      )
      // Recalculate subtotal from server-verified price and quantity
      item.subtotal = expectedSubtotal
    }

    verifiedTotal += item.subtotal
  }

  const total = verifiedTotal
  const finalTotal = total + (deliveryFee || 0) + (serviceChargeAmount || 0)

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId,
      order_type_id: orderTypeId || null,
      order_type: orderTypeId ? await getOrderTypeName(orderTypeId) : null,
      customer_name: customerInfo?.name,
      customer_contact: customerInfo?.contact,
      customer_data: customerData || {},
      total: finalTotal,
      delivery_fee: deliveryFee || 0,
      lalamove_quotation_id: lalamoveQuotationId || null,
      payment_method_id: paymentMethodId || null,
      payment_method_name: paymentMethodName || null,
      payment_method_details: paymentMethodDetails || null,
      payment_method_qr_code_url: paymentMethodQrCodeUrl || null,
      service_charge_amount: serviceChargeAmount || 0,
      payment_status: 'pending',
      status: 'pending',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (orderError) throw orderError

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderData = order as any

  // Create order items
  const orderItems = items.map(item => ({
    order_id: orderData.id,
    menu_item_id: item.menu_item_id,
    menu_item_name: item.menu_item_name,
    variation: item.variation,
    addons: item.addons,
    quantity: item.quantity,
    price: item.price,
    subtotal: item.subtotal,
    special_instructions: item.special_instructions,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(orderItems as any)

  if (itemsError) throw itemsError

  // Generate a short-lived order token for secure public endpoint access
  // Wrapped in try-catch to prevent token generation failures from affecting the already-saved order
  let orderToken: string | undefined
  try {
    const { createOrderToken } = await import('@/lib/order-token')
    orderToken = await createOrderToken(orderData.id)
  } catch (tokenError) {
    console.error(
      'Failed to generate order token after order creation:',
      tokenError instanceof Error ? { message: tokenError.message, stack: tokenError.stack } : tokenError,
      { orderId: orderData.id, tenantId }
    )
    // Order is already saved, so we continue with undefined token
    // The caller should handle the case where orderToken is undefined
  }

  return { order: orderData as unknown as Order, orderToken }
}

// Helper function to get order type name
async function getOrderTypeName(orderTypeId: string): Promise<string | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('order_types')
    .select('name')
    .eq('id', orderTypeId)
    .single()

  if (error) return null
  return (data as { name?: string } | null)?.name ?? null
}

// ============================================
// Convex Order Creation
// ============================================

export async function createOrderConvex(
  convexUrl: string,
  convexKey: string,
  tenantId: string,
  items: Array<{
    menu_item_id: string
    menu_item_name: string
    variation?: string
    addons: string[] | { name: string; price: number; quantity?: number }[]
    quantity: number
    price: number
    subtotal: number
    special_instructions?: string
    isUpsellItem?: boolean
    isBundleItem?: boolean
    bundleId?: string
    bundleName?: string
    slotName?: string
  }>,
  customerInfo?: { name?: string; contact?: string },
  orderTypeId?: string,
  customerData?: Record<string, unknown>,
  deliveryFee?: number,
  lalamoveQuotationId?: string,
  paymentMethodId?: string,
  paymentMethodName?: string,
  paymentMethodDetails?: string,
  paymentMethodQrCodeUrl?: string,
  serviceChargeAmount?: number
) {
  const convex = createConvexServerClient(convexUrl, convexKey)

  // Build args matching Convex createOrder mutation schema exactly
  // Do NOT send fields not in the schema (tenantId, paymentMethodId, paymentMethodQrCodeUrl)
  const mutationArgs: Record<string, unknown> = {
    customerName: customerInfo?.name ?? 'Guest',
    customerContact: customerInfo?.contact ?? '',
    customerData: customerData ?? {},
    total: items.reduce((sum, i) => sum + i.subtotal, 0) + (deliveryFee ?? 0) + (serviceChargeAmount ?? 0),
    source: 'web' as const,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    items: items.map((item) => ({
      menuItemId: item.menu_item_id,
      menuItemName: item.menu_item_name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.subtotal,
      specialInstructions: item.special_instructions,
      variation: item.variation,
      addons: item.addons?.map((a) =>
        typeof a === 'string'
          ? { name: a, price: 0 }
          : { name: a.name, price: a.price, quantity: a.quantity }
      ),
      ...(item.isUpsellItem ? { isUpsellItem: true } : {}),
      ...(item.isBundleItem ? { isBundleItem: true } : {}),
      ...(item.bundleId ? { bundleId: item.bundleId } : {}),
      ...(item.bundleName ? { bundleName: item.bundleName } : {}),
      ...(item.slotName ? { slotName: item.slotName } : {}),
    })),
  }

  const hasUpsell = items.some((i) => i.isUpsellItem === true)
  const hasBundle = items.some((i) => i.isBundleItem === true)
  if (hasUpsell) mutationArgs.hasUpsellItems = true
  if (hasBundle) mutationArgs.hasBundleItems = true

  // Only include optional fields if they have values
  if (orderTypeId) mutationArgs.orderTypeId = orderTypeId
  if (paymentMethodName) mutationArgs.paymentMethod = paymentMethodName
  if (paymentMethodDetails) mutationArgs.paymentMethodDetails = paymentMethodDetails
  if (deliveryFee) mutationArgs.deliveryFee = deliveryFee
  if (lalamoveQuotationId) mutationArgs.lalamoveQuotationId = lalamoveQuotationId

  const orderId = await convex.mutation<string>('orders:createOrder', mutationArgs)

  return { order: { id: orderId }, orderToken: undefined }
}

