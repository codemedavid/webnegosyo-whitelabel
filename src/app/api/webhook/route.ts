import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, sendMessage, sendMenuCard } from '@/lib/facebook-api'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getActivePageByPageId,
  getActivePageById,
} from '@/lib/facebook/page-tokens'
import { formatOrderMessage } from '@/lib/messenger-message-formatter'
import { createLogger } from '@/lib/logger'
import { mayAnswerOrderReferral, ORDER_REFERRAL_REFUSED_MESSAGE } from '@/lib/messenger/order-referral'

// Tracing is opt-in (DEBUG_MESSENGER): these lines carry PSIDs and guest messages.
const log = createLogger('[Webhook]', 'DEBUG_MESSENGER')

// Keywords related to order status/tracking - these BLOCK menu auto-reply
const ORDER_STATUS_KEYWORDS = [
  'where is my order', 'order status', 'track order', 'my order',
  'tracking', 'where is order', 'order update', 'delivery status',
  'when will my order', 'order location', 'check order'
]

// Keywords that trigger menu card auto-reply
// Note: 'order' removed to prevent false positives with order-status queries
const MENU_KEYWORDS = [
  'menu', 'product', 'products', 'i want to order', 'place order', 'new order',
  'item', 'items', 'food', 'catalog', 'price', 'prices', 'what do you have',
  'what do you sell', 'available', 'offer', 'offerings'
]

/**
 * Create or update a messenger session for PSID-tenant association.
 * This enables PSID validation for subsequent API calls (e.g., cart sync).
 */
async function ensureMessengerSession(
  psid: string,
  tenantId: string
): Promise<void> {
  try {
    // Service role: the webhook is called by Facebook with no session, so
    // there is no signed-in client to write the session row with. Scoped to
    // the one psid being recorded.
    const { error } = await createAdminClient()
      .from('messenger_sessions')
      .upsert({
        psid,
        tenant_id: tenantId,
        state: 'menu',
        updated_at: new Date().toISOString(),
      } as unknown as never, {
        onConflict: 'psid',
      })

    if (error) {
      console.error('[Webhook] Failed to upsert messenger session:', error)
    } else {
      const maskedPsid = psid.length >= 4 ? `****${psid.slice(-4)}` : '****'
      log.debug(`✅ Messenger session ensured for PSID ${maskedPsid}`)
    }
  } catch (error) {
    console.error('[Webhook] Exception creating messenger session:', error)
    // Non-critical, continue processing
  }
}

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
    log.debug('Verification successful')
    return new NextResponse(challenge, { status: 200 })
  }

  console.error('[Webhook] Verification failed', { mode, tokenProvided: !!token })
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

    log.debug('Received webhook POST request')
    log.debug('Body received', { bytes: bodyText.length })
    // Note: Raw body preview removed to prevent PII exposure in production logs

    // Verify webhook signature - fail-closed: reject if secret or signature is missing
    const appSecret = process.env.FACEBOOK_APP_SECRET
    const signature = request.headers.get('x-hub-signature-256')

    if (!appSecret) {
      console.error('[Webhook] FACEBOOK_APP_SECRET not configured - rejecting request')
      return new NextResponse('Server configuration error', { status: 500 })
    }

    if (!signature) {
      console.error('[Webhook] Missing x-hub-signature-256 header - rejecting request')
      return new NextResponse('Missing signature', { status: 403 })
    }

    if (!verifyWebhookSignature(bodyText, signature)) {
      console.error('[Webhook] Invalid signature - rejecting request')
      return new NextResponse('Invalid signature', { status: 403 })
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
      log.debug('⚠️ No entries in webhook payload - Facebook sent empty webhook')
      log.debug('Full body structure', { body })
      return new NextResponse('OK', { status: 200 })
    }

    log.debug(`✅ Received ${body.entry.length} entry/entries`)

    // Process each entry
    for (const entry of body.entry) {
      const pageId = entry.id
      log.debug(`Processing entry for page: ${pageId}`)

      if (!entry.messaging || entry.messaging.length === 0) {
        log.debug(`No messaging events in entry for page: ${pageId}`)
        continue
      }

      log.debug(`Processing ${entry.messaging.length} messaging event(s) for page: ${pageId}`)

      for (const event of entry.messaging) {
        const senderId = event.sender.id
        // Log full event structure for debugging (only first time to avoid spam)
        if (process.env.NODE_ENV === 'development') {
          log.debug('Full event structure', { event })
        }
        log.debug(`Processing event from sender: ${senderId}`, {
          hasMessage: !!event.message,
          hasReferral: !!event.referral,
          hasPostback: !!event.postback,
          referralRef: event.referral?.ref,
          messageReferralRef: event.message?.referral?.ref,
          postbackReferralRef: event.postback?.referral?.ref,
        })

        // Handle echo messages (messages sent by admin/bot)
        // When admin types menu keywords, send menu card to the customer
        // IMPORTANT: In echo events:
        //   - event.sender.id = PAGE ID (the page that sent the message)
        //   - event.recipient.id = CUSTOMER PSID (the recipient who will receive the card)
        //   - entry.id = PAGE ID (same as event.sender.id)
        if (event.message?.is_echo) {
          const echoText = event.message.text || ''
          const lowerEchoText = echoText.toLowerCase()

          // Log echo event structure for debugging
          log.debug(`📤 Echo message detected:`, {
            senderId: event.sender.id,  // This is the PAGE ID
            recipientId: event.recipient.id,  // This is the CUSTOMER PSID
            entryId: entry.id,  // This is the PAGE ID
            textLength: echoText.length,
            textPreview: echoText.substring(0, 50),
          })

          // Check for menu keywords (both natural keywords and command format like /menu or !menu)
          const hasMenuKeyword = MENU_KEYWORDS.some(keyword => lowerEchoText.includes(keyword))
          const hasMenuCommand = /^[\/!](menu|products?|catalog|order)/.test(lowerEchoText.trim())

          if (hasMenuKeyword || hasMenuCommand) {
            log.debug(`🍽️ Admin triggered menu card via echo (keyword: ${hasMenuKeyword}, command: ${hasMenuCommand})`)

            try {
              // Service role: Facebook calls this webhook with no session, so an
              // anon read is refused by RLS. Scoped to the ids in the event.
              const supabase = createAdminClient()
              // entry.id and event.sender.id should both be the page ID in echo events
              const pageId = entry.id
              // In echo messages, recipient.id is the customer's PSID
              const customerPsid = event.recipient.id

              log.debug(`Looking up Facebook page with page_id: ${pageId}`)

              // Find tenant by page ID
              const page = await getActivePageByPageId(pageId)

              if (page) {
                log.debug(`Found Facebook page, tenant_id: ${page.tenant_id}`)

                // Get tenant details for the menu card
                const { data: tenantData, error: tenantError } = await supabase
                  .from('tenants')
                  .select('id, name, slug, logo_url, domain')
                  .eq('id', page.tenant_id)
                  .single()

                if (tenantError) {
                  console.error(`[Webhook] Database error looking up tenant:`, tenantError)
                }

                const tenant = tenantData as { id: string; name: string; slug: string; logo_url?: string | null; domain?: string | null } | null

                if (tenant) {
                  // Mask customer PSID for logging in production
                  const maskedPsid = process.env.NODE_ENV === 'development'
                    ? customerPsid
                    : (customerPsid.length > 4 ? '****' + customerPsid.slice(-4) : '****')

                  log.debug(`Sending menu card to customer ${maskedPsid} for tenant: ${tenant.name}`)
                  log.debug(`Tenant details:`, {
                    name: tenant.name,
                    slug: tenant.slug,
                    hasLogo: !!tenant.logo_url,
                    hasDomain: !!tenant.domain,
                  })

                  const sent = await sendMenuCard(customerPsid, page.page_access_token, tenant)

                  if (sent) {
                    log.debug(`✅ Admin-triggered menu card sent successfully to ${maskedPsid}`)
                  } else {
                    console.error(`[Webhook] ❌ Failed to send admin-triggered menu card to ${maskedPsid}`)
                  }
                } else {
                  console.warn(`[Webhook] Tenant not found for tenant_id: ${page.tenant_id}`)
                }
              } else {
                console.warn(`[Webhook] No active Facebook page found for page_id: ${pageId}`)
                console.warn(`[Webhook] Hint: Check that facebook_pages table has a row with page_id="${pageId}" and is_active=true`)
              }
            } catch (error) {
              console.error(`[Webhook] Error in admin menu trigger:`, error)
            }
          } else {
            log.debug(`Skipping non-menu echo message (text: "${echoText.substring(0, 30)}...")`)
          }

          // Always continue after processing echo - don't fall through to customer message handling
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
          log.debug(`Received referral event with ref: ${ref}`, {
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
            log.debug(`Processing order referral for order ID: ${orderId}`)

            try {
              // Load order from database
              // Service role (see above): an anon read of the order is refused by RLS.
              const supabase = createAdminClient()

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
                const pageData = await getActivePageById(tenant.facebook_page_id)

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

              // The order is read with the service role, so only the order's OWN
              // page may answer it: a ref typed into another store's thread
              // must not reveal this order.
              if (facebookPage.page_id !== entry.id) {
                console.error(`[Webhook] Referral for order ${orderId} arrived on a page that is not the store's`)
                continue
              }

              // The order id alone proves nothing (it travels in the tracking
              // link), and this answer carries the guest's name, phone and address.
              if (!mayAnswerOrderReferral({
                senderId,
                customerData: order.customer_data,
                createdAt: order.created_at,
                now: Date.now(),
              })) {
                // Answer without details: a real customer on a mismatched or
                // stale link should not meet silence.
                log.debug('Referral refused for an order owned by another conversation or too old', { orderId })
                await sendMessage(senderId, facebookPage.page_access_token, ORDER_REFERRAL_REFUSED_MESSAGE)
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
                log.debug(`✅ Order message sent successfully for order: ${orderId} to sender: ${senderId}`)

                // Ensure messenger session exists for PSID-tenant validation
                await ensureMessengerSession(senderId, tenant.id)

                // Store PSID for future proactive messaging (within the
                // 24-hour window). Conditional on the row we read: customer_data
                // is rewritten whole, so a concurrent edit (delivery details, a
                // pin link) must not be clobbered by this copy. A lost race
                // matches no row and simply skips the write.
                try {
                  const now = new Date().toISOString()
                  let psidWrite = supabase
                    .from('orders')
                    .update({
                      customer_data: {
                        ...(order.customer_data as Record<string, unknown> || {}),
                        messenger_sender_id: senderId,
                        messenger_psid: senderId,
                        messenger_message_sent_at: now,
                        messenger_last_interaction: now,
                      },
                    } as unknown as never)
                    .eq('id', orderId)
                  if (order.updated_at) {
                    psidWrite = psidWrite.eq('updated_at', order.updated_at)
                  }
                  const { error: psidError } = await psidWrite
                  if (psidError) {
                    console.error(`[Webhook] Failed to store sender mapping for order ${orderId}:`, psidError.message)
                  } else {
                    log.debug(`Stored PSID ${senderId} for future proactive messaging`)
                  }
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
            log.debug(`Referral ref "${ref}" does not match ORDER_ pattern, ignoring`)
          }
        } else {
          // Log full event for debugging - referral might be nested
          // Facebook referral events can be tricky - they only fire for NEW conversations
          // For existing conversations, Facebook often doesn't send referral events
          log.debug(`⚠️ No referral ref found in event from sender ${senderId}`)
          log.debug(`⚠️ NOTE: Referral events only fire when opening a NEW conversation.`)
          log.debug(`⚠️ If conversation already exists, Facebook may not send referral event.`)
          log.debug(`⚠️ This is a known Facebook limitation. Fallback will attempt to match recent orders.`)

          // ACTIVE FALLBACK: When referral event doesn't fire (common for existing conversations),
          // attempt to match with very recent orders. This is SAFE because:
          // - Only orders created within last 1 minute are considered
          // - There must be EXACTLY ONE unsent order (no ambiguity)
          // - Order must not have messenger_message_sent_at set
          // - Only the FIRST person who messages gets the order
          // If multiple unsent orders exist, we skip to prevent wrong delivery.
          // See feature flag: N/A (always active with strict safety rules)

          if (event.message && !event.message.is_echo) {
            const messageText = event.message.text || ''
            log.debug(`Received message from ${senderId}`, {
              hasText: !!messageText,
              textLength: messageText.length,
            })

            // AUTO-REPLY: Check if message contains menu-related keywords
            // BUT FIRST - check if this is an order status query to prevent false positives
            const lowerMessage = messageText.toLowerCase()
            const isOrderStatusQuery = ORDER_STATUS_KEYWORDS.some(keyword => lowerMessage.includes(keyword))
            const hasMenuKeyword = MENU_KEYWORDS.some(keyword => lowerMessage.includes(keyword))

            if (hasMenuKeyword && !isOrderStatusQuery) {
              log.debug(`🍽️ Menu keyword detected in message (length: ${messageText.length})`)

              try {
                // Service role (see above): the webhook has no session.
                const supabase = createAdminClient()
                const pageId = entry.id

                // Find tenant by page ID
                const pageData = await getActivePageByPageId(pageId)

                const page = pageData as { tenant_id: string; page_access_token: string } | null

                if (page) {
                  // Get tenant details for the menu card
                  const { data: tenantData } = await supabase
                    .from('tenants')
                    .select('id, name, slug, logo_url, domain')
                    .eq('id', page.tenant_id)
                    .single()

                  const tenant = tenantData as { id: string; name: string; slug: string; logo_url?: string | null; domain?: string | null } | null

                  if (tenant) {
                    log.debug(`Sending menu card for tenant: ${tenant.name}`)
                    const sent = await sendMenuCard(senderId, page.page_access_token, tenant)

                    if (sent) {
                      log.debug(`✅ Menu card sent successfully to ${senderId}`)
                      // Ensure messenger session exists for PSID-tenant validation
                      await ensureMessengerSession(senderId, tenant.id)
                      // The menu reply completed this event
                      continue
                    } else {
                      console.error(`[Webhook] ❌ Failed to send menu card to ${senderId}`)
                    }
                  } else {
                    console.warn(`[Webhook] Tenant not found for page: ${pageId}`)
                  }
                } else {
                  console.warn(`[Webhook] No active Facebook page found for page ID: ${pageId}`)
                }
              } catch (error) {
                console.error(`[Webhook] Error in menu auto-reply:`, error)
                // Leave order delivery to the explicit referral flow
              }
            }

            // A plain message provides no proof of which order belongs to its
            // sender. Only the explicit referral flow above may send an order.

          }
        }
      }
    }

    // Always return 200 OK to acknowledge receipt
    log.debug('Webhook processing completed, returning 200 OK')
    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[Webhook] ❌ Unhandled error in webhook handler:', error)
    // Still return 200 to prevent Facebook from retrying
    return new NextResponse('OK', { status: 200 })
  }
}

