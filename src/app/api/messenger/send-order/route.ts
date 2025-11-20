import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMessage } from '@/lib/facebook-api'
import { formatOrderMessage } from '@/lib/messenger-message-formatter'

/**
 * Proactive order message sending endpoint
 * Attempts to send order message immediately after order creation
 * Works for users who have interacted with the page in the last 24 hours
 * 
 * This is called from the checkout page after order creation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, tenantId } = body

    if (!orderId || !tenantId) {
      return NextResponse.json(
        { error: 'Missing orderId or tenantId' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get order details
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single()

    if (orderError || !orderData) {
      console.error(`[Send Order] Order not found: ${orderId}`, orderError)
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    const order = orderData as Record<string, unknown> & {
      id: string
      tenant_id: string
      customer_data?: unknown
    }

    // Check if order already has a PSID stored (from previous interaction)
    const customerData = order.customer_data as Record<string, unknown> | undefined
    const storedPsid = customerData?.messenger_psid as string | undefined

    if (!storedPsid) {
      // No PSID stored - can't send proactively
      // This is expected for first-time users
      // The webhook will handle it when they click the link or send a message
      console.log(`[Send Order] No PSID stored for order ${orderId}, will be sent via webhook`)
      return NextResponse.json({
        success: false,
        message: 'No PSID stored. Message will be sent via webhook when user interacts.',
      })
    }

    // Get tenant and Facebook page
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('*, facebook_page_id')
      .eq('id', tenantId)
      .single()

    if (!tenantData) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    const tenant = tenantData as Record<string, unknown> & {
      id: string
      name: string
      facebook_page_id?: string | null
    }

    if (!tenant.facebook_page_id) {
      return NextResponse.json(
        { error: 'No Facebook page connected' },
        { status: 400 }
      )
    }

    // Get Facebook page access token
    const { data: pageData } = await supabase
      .from('facebook_pages')
      .select('page_access_token')
      .eq('id', tenant.facebook_page_id)
      .eq('is_active', true)
      .single()

    if (!pageData) {
      return NextResponse.json(
        { error: 'Facebook page not found or inactive' },
        { status: 404 }
      )
    }

    const page = pageData as { page_access_token: string }

    // Get order items
    const { data: orderItemsData } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)

    const orderItems = (orderItemsData || []) as Array<{
      menu_item_name: string
      variation?: string
      addons?: string[]
      quantity: number
      subtotal: number
      special_instructions?: string
    }>

    // Format order with items
    const orderDataRecord = orderData as Record<string, unknown>
    const orderWithItems = {
      ...order,
      items: orderItems.map((item) => ({
        menu_item_name: item.menu_item_name,
        variation: item.variation,
        addons: item.addons || [],
        quantity: item.quantity,
        subtotal: item.subtotal,
        special_instructions: item.special_instructions,
      })),
      created_at: (orderDataRecord.created_at as string) || new Date().toISOString(),
      updated_at: (orderDataRecord.updated_at as string) || new Date().toISOString(),
    }

    // Format and send message
    const message = formatOrderMessage(
      orderWithItems as unknown as Parameters<typeof formatOrderMessage>[0],
      tenantData as unknown as Parameters<typeof formatOrderMessage>[1]
    )

    const sent = await sendMessage(
      storedPsid,
      page.page_access_token,
      message
    )

    if (sent) {
      // Mark as sent
      await supabase
        .from('orders')
        .update({
          customer_data: {
            ...(order.customer_data as Record<string, unknown> || {}),
            messenger_sender_id: storedPsid,
            messenger_message_sent_at: new Date().toISOString(),
            messenger_sent_proactively: true,
          },
        } as unknown as never)
        .eq('id', orderId)

      console.log(`[Send Order] ✅ Proactively sent order message for order: ${orderId} to PSID: ${storedPsid}`)
      return NextResponse.json({ success: true, message: 'Order message sent proactively' })
    } else {
      console.error(`[Send Order] ❌ Failed to send message for order: ${orderId}`)
      return NextResponse.json(
        { success: false, error: 'Failed to send message' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[Send Order] ❌ Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

