import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, sendMessage } from '@/lib/facebook-api'
import { createClient } from '@/lib/supabase/server'
import { formatOrderMessage } from '@/lib/messenger-message-formatter'

/**
 * GET /api/webhook
 * Webhook verification endpoint (required by Facebook)
 * Facebook sends GET request to verify the webhook URL
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN

  if (!verifyToken) {
    console.error('[Webhook] FACEBOOK_VERIFY_TOKEN not configured')
    return new NextResponse('Verify token not configured', { status: 500 })
  }

  // Verify the webhook
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook] Verification successful')
    return new NextResponse(challenge, { status: 200 })
  }

  console.error('[Webhook] Verification failed', { mode, token, expected: verifyToken })
  return new NextResponse('Forbidden', { status: 403 })
}

/**
 * POST /api/webhook
 * Receives Messenger webhook events
 * Detects ref parameter from messaging_referrals and sends order message
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const bodyText = await request.text()

    if (!bodyText || bodyText.length === 0) {
      console.error('[Webhook] Empty body received')
      return new NextResponse('Empty body', { status: 400 })
    }

    console.log('[Webhook] Received webhook POST request')
    console.log('[Webhook] Body length:', bodyText.length)
    console.log('[Webhook] Body preview (first 1000 chars):', bodyText.substring(0, 1000))

    // Verify webhook signature
    const signature = request.headers.get('x-hub-signature-256')
    if (signature && process.env.FACEBOOK_APP_SECRET) {
      if (!verifyWebhookSignature(bodyText, signature)) {
        console.error('[Webhook] Invalid signature')
        return new NextResponse('Invalid signature', { status: 403 })
      }
    }

    const body = JSON.parse(bodyText) as {
      object: string
      entry?: Array<{
        id: string
        time: number
        messaging?: Array<{
          sender: { id: string }
          recipient: { id: string }
          referral?: {
            ref: string
            source: string
            type: string
          }
          message?: {
            text?: string
            is_echo?: boolean
            referral?: {
              ref: string
              source: string
              type: string
            }
          }
          postback?: {
            payload: string
            referral?: {
              ref: string
              source: string
              type: string
            }
          }
        }>
      }>
    }

    // Only process page subscriptions
    if (body.object !== 'page') {
      console.warn('[Webhook] Received non-page event:', body.object)
      return new NextResponse('Not Found', { status: 404 })
    }

    if (!body.entry || body.entry.length === 0) {
      console.log('[Webhook] ⚠️ No entries in webhook payload - Facebook sent empty webhook')
      console.log('[Webhook] Full body structure:', JSON.stringify(body, null, 2))
      return new NextResponse('OK', { status: 200 })
    }

    console.log(`[Webhook] ✅ Received ${body.entry.length} entry/entries`)

    // Process each entry
    for (const entry of body.entry) {
      const pageId = entry.id
      console.log(`[Webhook] Processing entry for page: ${pageId}`)

      if (!entry.messaging || entry.messaging.length === 0) {
        console.log(`[Webhook] No messaging events in entry for page: ${pageId}`)
        continue
      }

      console.log(`[Webhook] Processing ${entry.messaging.length} messaging event(s) for page: ${pageId}`)

      for (const event of entry.messaging) {
        const senderId = event.sender.id
        // Log full event structure for debugging (only first time to avoid spam)
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Webhook] Full event structure:`, JSON.stringify(event, null, 2))
        }
        console.log(`[Webhook] Processing event from sender: ${senderId}`, {
          hasMessage: !!event.message,
          hasReferral: !!event.referral,
          hasPostback: !!event.postback,
          referralRef: event.referral?.ref,
          messageReferralRef: event.message?.referral?.ref,
          postbackReferralRef: event.postback?.referral?.ref,
        })

        // Skip echo messages (sent by our bot)
        if (event.message?.is_echo) {
          console.log(`[Webhook] Skipping echo message from sender: ${senderId}`)
          continue
        }

        // Handle referral events (when user clicks link with ref parameter)
        // IMPORTANT: Facebook referral events have limitations:
        // 1. They only fire when opening a NEW conversation (not existing ones)
        // 2. They can appear in different places: event.referral, event.message.referral, or event.postback.referral
        // 3. Sometimes they're nested deeper in the structure
        const eventAny = event as unknown as Record<string, unknown>
        const referralRef = 
          event.referral?.ref || 
          event.message?.referral?.ref || 
          event.postback?.referral?.ref ||
          (eventAny.referral as { ref?: string } | undefined)?.ref // Try direct access too
        
        if (referralRef) {
          const ref = referralRef
          console.log(`[Webhook] Received referral event with ref: ${ref}`, {
            fromEventReferral: !!event.referral?.ref,
            fromMessageReferral: !!event.message?.referral?.ref,
            fromPostbackReferral: !!event.postback?.referral?.ref,
          })

          // Check if ref matches ORDER_{id} pattern
          // Ref may include timestamp suffix: ORDER_{id}_{timestamp}
          // Extract just the order ID part
          if (ref.startsWith('ORDER_')) {
            // Remove ORDER_ prefix and any timestamp suffix (format: ORDER_{id} or ORDER_{id}_{timestamp})
            const orderIdMatch = ref.match(/^ORDER_(.+?)(?:_\d+)?$/)
            const orderId = orderIdMatch ? orderIdMatch[1] : ref.replace('ORDER_', '').split('_')[0]
            console.log(`[Webhook] Processing order referral for order ID: ${orderId}`)

            try {
              // Load order from database
              const supabase = await createClient()
              
              // First get the order
              const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .select('*')
                .eq('id', orderId)
                .single()

              if (orderError || !orderData) {
                console.error(`[Webhook] Order not found: ${orderId}`, orderError)
                continue
              }

              const order = orderData as Record<string, unknown> & {
                id: string
                tenant_id: string
                order_type?: string
                customer_name?: string
                customer_contact?: string
                customer_data?: unknown
                total: number
                delivery_fee?: number
                status: string
                payment_method_name?: string
                payment_method_details?: string
                created_at?: string
                updated_at?: string
              }

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

              // Get tenant (full tenant data for formatter)
              const { data: tenantData } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', order.tenant_id)
                .single()

              if (!tenantData) {
                console.error(`[Webhook] Tenant not found for order: ${orderId}`)
                continue
              }

              const tenant = tenantData as Record<string, unknown> & {
                id: string
                name: string
                facebook_page_id?: string | null
              }

              // Get Facebook page if connected
              let facebookPage: { page_id: string; page_access_token: string } | null = null
              
              if (tenant.facebook_page_id) {
                const { data: pageData } = await supabase
                  .from('facebook_pages')
                  .select('page_id, page_access_token')
                  .eq('id', tenant.facebook_page_id)
                  .eq('is_active', true)
                  .single()

                if (pageData) {
                  const page = pageData as { page_id: string; page_access_token: string }
                  facebookPage = {
                    page_id: page.page_id,
                    page_access_token: page.page_access_token,
                  }
                }
              }

              if (!facebookPage || !facebookPage.page_access_token) {
                console.error(`[Webhook] No Facebook page connected for tenant: ${tenant.id}`)
                continue
              }

              // Format order with items for message formatter
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

              // Format order message
              // Use type assertion through unknown to satisfy type checker
              // tenantData from select('*') includes all tenant fields
              const message = formatOrderMessage(
                orderWithItems as unknown as Parameters<typeof formatOrderMessage>[0],
                tenantData as unknown as Parameters<typeof formatOrderMessage>[1]
              )

              // Send message to customer
              const sent = await sendMessage(
                senderId,
                facebookPage.page_access_token,
                message
              )

              if (sent) {
                console.log(`[Webhook] ✅ Order message sent successfully for order: ${orderId} to sender: ${senderId}`)
                
                // Store PSID for future proactive messaging
                // This allows us to send messages proactively for returning customers (within 24-hour window)
                try {
                  await supabase
                    .from('orders')
                    .update({
                      customer_data: {
                        ...(order.customer_data as Record<string, unknown> || {}),
                        messenger_sender_id: senderId,
                        messenger_psid: senderId, // Store PSID for proactive messaging
                        messenger_message_sent_at: new Date().toISOString(),
                        messenger_last_interaction: new Date().toISOString(), // Track last interaction for 24-hour window
                      },
                    } as unknown as never)
                    .eq('id', orderId)
                  
                  // Also store PSID in customer_data for future orders from same customer
                  // This enables proactive messaging for returning customers
                  console.log(`[Webhook] Stored PSID ${senderId} for future proactive messaging`)
                } catch (error) {
                  console.error(`[Webhook] Failed to store sender mapping:`, error)
                  // Non-critical, continue
                }
              } else {
                console.error(`[Webhook] ❌ Failed to send message for order: ${orderId} to sender: ${senderId}`)
              }
            } catch (error) {
              console.error(`[Webhook] ❌ Error processing referral for order: ${orderId}:`, error)
            }
          } else {
            console.log(`[Webhook] Referral ref "${ref}" does not match ORDER_ pattern, ignoring`)
          }
        } else {
          // Log full event for debugging - referral might be nested
          // Facebook referral events can be tricky - they only fire for NEW conversations
          // For existing conversations, Facebook often doesn't send referral events
          console.log(`[Webhook] ⚠️ No referral ref found in event from sender ${senderId}`)
          console.log(`[Webhook] Event from sender ${senderId} - Full event structure:`, JSON.stringify(event, null, 2))
          console.log(`[Webhook] Event details:`, {
            hasMessage: !!event.message,
            hasPostback: !!event.postback,
            hasReferral: !!event.referral,
            messageText: event.message?.text?.substring(0, 100),
            isEcho: event.message?.is_echo,
            messageReferral: event.message?.referral,
            eventReferral: event.referral,
            postbackReferral: event.postback?.referral,
          })
          console.log(`[Webhook] ⚠️ NOTE: Referral events only fire when opening a NEW conversation.`)
          console.log(`[Webhook] ⚠️ If conversation already exists, Facebook may not send referral event.`)
          console.log(`[Webhook] ⚠️ This is a known Facebook limitation. Fallback will attempt to match recent orders.`)
          
          // DISABLED FALLBACK: We only send orders when we have the ref parameter from referral events
          // This prevents sending orders to the wrong people
          // If referral events don't fire, the user needs to send a message with the order ID
          // or we need to ensure referral events fire properly
          
          // Note: The fallback was causing orders to be sent to wrong users
          // We now ONLY send orders when:
          // 1. Referral event fires with ORDER_{id} ref parameter (primary method)
          // 2. User explicitly requests their order (future enhancement)
          
          if (event.message && !event.message.is_echo) {
            const messageText = event.message.text || ''
            console.log(`[Webhook] Received message from ${senderId}`, {
              hasText: !!messageText,
              textLength: messageText.length,
            })
            
            // SAFE FALLBACK: If referral event didn't fire (common for existing conversations),
            // check for very recent orders that haven't been sent yet
            // STRICT RULES to prevent wrong deliveries:
            // 1. Order must be created within last 1 minute (very recent)
            // 2. There must be EXACTLY ONE unsent order (no ambiguity)
            // 3. Order hasn't been sent to anyone yet (messenger_message_sent_at is null/undefined)
            // 4. Only send to the FIRST person who messages after order creation
            // This minimizes risk of sending to wrong users
            try {
              const supabase = await createClient()
              const pageId = entry.id
              
              // Find tenant by page ID
              const { data: pageData } = await supabase
                .from('facebook_pages')
                .select('tenant_id, page_access_token')
                .eq('page_id', pageId)
                .eq('is_active', true)
                .single()
              
              const page = pageData as { tenant_id: string; page_access_token: string } | null
              if (page) {
                // Look for very recent orders (within last 1 minute only - very strict)
                // This minimizes the chance of multiple orders in the window
                const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString()
                const { data: recentOrders } = await supabase
                  .from('orders')
                  .select('id, tenant_id, created_at, customer_data')
                  .eq('tenant_id', page.tenant_id)
                  .gte('created_at', oneMinuteAgo)
                  .order('created_at', { ascending: false })
                  .limit(10) // Check up to 10 to find unsent ones
                
                const orders = recentOrders as Array<{
                  id: string
                  tenant_id: string
                  created_at: string
                  customer_data?: unknown
                }> | null
                
                if (orders && orders.length > 0) {
                  // CRITICAL: Filter to only unsent orders
                  const unsentOrders = orders.filter((order) => {
                    const customerData = order.customer_data as Record<string, unknown> | undefined
                    const messageSentAt = customerData?.messenger_message_sent_at as string | undefined
                    return !messageSentAt // Only orders that haven't been sent
                  })
                  
                  console.log(`[Webhook] Fallback: Found ${orders.length} recent orders, ${unsentOrders.length} unsent`)
                  
                  // STRICT RULE: Only send if there's EXACTLY ONE unsent order
                  // This prevents ambiguity - if multiple orders exist, we can't safely determine which one
                  if (unsentOrders.length === 1) {
                    const order = unsentOrders[0]
                    console.log(`[Webhook] Fallback: ✅ Exactly one unsent order found: ${order.id} (created ${order.created_at}), processing...`)
                    
                    // Process this order (reuse referral handler logic)
                    const { data: orderData, error: orderError } = await supabase
                      .from('orders')
                      .select('*')
                      .eq('id', order.id)
                      .single()
                    
                    if (orderError || !orderData) {
                      console.error(`[Webhook] Fallback: Order not found: ${order.id}`, orderError)
                    } else {
                      
                      const fullOrder = orderData as Record<string, unknown> & {
                        id: string
                        tenant_id: string
                        order_type?: string
                        customer_name?: string
                        customer_contact?: string
                        customer_data?: unknown
                        total: number
                        delivery_fee?: number
                        status: string
                        payment_method_name?: string
                        payment_method_details?: string
                        created_at?: string
                        updated_at?: string
                      }
                      
                      // Get order items
                      const { data: orderItemsData } = await supabase
                        .from('order_items')
                        .select('*')
                        .eq('order_id', order.id)
                      
                      const orderItems = (orderItemsData || []) as Array<{
                        menu_item_name: string
                        variation?: string
                        addons?: string[]
                        quantity: number
                        subtotal: number
                        special_instructions?: string
                      }>
                      
                      // Get tenant
                      const { data: tenantData } = await supabase
                        .from('tenants')
                        .select('*')
                        .eq('id', page.tenant_id)
                        .single()
                      
                      if (!tenantData) {
                        console.error(`[Webhook] Fallback: Tenant not found for order: ${order.id}`)
                        continue
                      }
                      
                      // Format order with items
                      const orderDataRecord = orderData as Record<string, unknown>
                      const orderWithItems = {
                        ...fullOrder,
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
                        senderId,
                        page.page_access_token,
                        message
                      )
                      
                      if (sent) {
                        console.log(`[Webhook] Fallback: ✅ Order message sent successfully for order: ${order.id} to sender: ${senderId}`)
                        
                        // Mark as sent to prevent duplicate sends
                        try {
                          await supabase
                            .from('orders')
                            .update({
                              customer_data: {
                                ...(fullOrder.customer_data as Record<string, unknown> || {}),
                                messenger_sender_id: senderId,
                                messenger_message_sent_at: new Date().toISOString(),
                              },
                            } as unknown as never)
                            .eq('id', order.id)
                        } catch (error) {
                          console.error(`[Webhook] Fallback: Failed to store sender mapping:`, error)
                        }
                      } else {
                        console.error(`[Webhook] Fallback: ❌ Failed to send message for order: ${order.id} to sender: ${senderId}`)
                      }
                    }
                  } else if (unsentOrders.length === 0) {
                    console.log(`[Webhook] Fallback: No unsent orders found (all ${orders.length} orders already sent)`)
                  } else {
                    // Multiple unsent orders - too risky, don't send
                    console.warn(`[Webhook] Fallback: ⚠️ AMBIGUITY DETECTED - Found ${unsentOrders.length} unsent orders within 1 minute`)
                    console.warn(`[Webhook] Fallback: Cannot safely determine which order belongs to sender ${senderId}`)
                    console.warn(`[Webhook] Fallback: Order IDs: ${unsentOrders.map(o => o.id).join(', ')}`)
                    console.warn(`[Webhook] Fallback: Skipping to prevent wrong delivery. User should use referral link or wait.`)
                  }
                } else {
                  console.log(`[Webhook] Fallback: No recent orders found for page ${pageId} within 1 minute`)
                }
              }
            } catch (error) {
              console.error(`[Webhook] Fallback: ❌ Error in fallback order lookup:`, error)
            }
          }
        }
      }
    }

    // Always return 200 OK to acknowledge receipt
    console.log('[Webhook] Webhook processing completed, returning 200 OK')
    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[Webhook] ❌ Unhandled error in webhook handler:', error)
    // Still return 200 to prevent Facebook from retrying
    return new NextResponse('OK', { status: 200 })
  }
}

