import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { sendMessage } from '@/lib/facebook-api'
import { formatOrderMessage } from '@/lib/messenger-message-formatter'
import { verifyOrderToken } from '@/lib/order-token'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

/**
 * Hash an IP address for privacy-preserving logging
 */
function hashIP(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12)
}

/**
 * POST /api/messenger/send-order-public
 * 
 * Public endpoint for sending order messages from checkout
 * Uses short-lived order tokens for secure verification instead of relying on UUIDs
 * 
 * Security measures:
 * - Order token verification (cryptographic, short-lived)
 * - PSID pulled from stored order data, not from request
 * - IP-based rate limiting
 */
export async function POST(request: NextRequest) {
    try {
        // Rate limiting check
        const clientIP = getClientIP(request)
        if (!clientIP) {
            return NextResponse.json(
                { error: 'Unable to verify client IP address' },
                { status: 400 }
            )
        }
        const rateLimit = checkRateLimit(clientIP, { maxRequests: 20, windowMs: 60000 })

        if (!rateLimit.allowed) {
            const hashedIP = hashIP(clientIP)
            console.warn(`[Send Order Public] Rate limit exceeded for IP hash: ${hashedIP}`)
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
                    },
                }
            )
        }

        // Parse JSON body with explicit error handling for malformed JSON
        let body: Record<string, unknown>
        try {
            body = await request.json()
        } catch (parseError) {
            const isSyntaxError = parseError instanceof SyntaxError ||
                (parseError && typeof parseError === 'object' && 'name' in parseError && parseError.name === 'SyntaxError')
            if (isSyntaxError) {
                return NextResponse.json(
                    { error: 'Invalid JSON in request body' },
                    { status: 400 }
                )
            }
            throw parseError // Re-throw non-JSON errors for outer catch
        }

        const { orderId, tenantId, orderToken } = body as {
            orderId?: string
            tenantId?: string
            orderToken?: string
        }

        if (!orderId || typeof orderId !== 'string' || !tenantId || typeof tenantId !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid orderId or tenantId' },
                { status: 400 }
            )
        }

        // Verify order token if provided (required for secure verification)
        if (!orderToken || typeof orderToken !== 'string') {
            console.warn(`[Send Order Public] No order token provided for order: ${orderId}`)
            return NextResponse.json(
                { error: 'Missing order token' },
                { status: 401 }
            )
        }

        const isValidToken = await verifyOrderToken(orderId, orderToken)
        if (!isValidToken) {
            console.warn(`[Send Order Public] Invalid or expired token for order: ${orderId}`)
            return NextResponse.json(
                { error: 'Invalid or expired order token' },
                { status: 401 }
            )
        }

        const supabase = await createClient()

        // Get order details - token verification already confirms ownership
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .eq('tenant_id', tenantId)
            .single()

        if (orderError || !orderData) {
            console.error(`[Send Order Public] Order not found: ${orderId}`, orderError)
            return NextResponse.json(
                { error: 'Order not found' },
                { status: 404 }
            )
        }

        const order = orderData as Record<string, unknown> & {
            id: string
            tenant_id: string
            customer_data?: Record<string, unknown>
        }

        // ALWAYS get PSID from stored order data, never from request body
        const storedPsid = order.customer_data?.messenger_psid as string | undefined

        if (!storedPsid) {
            // No PSID - user didn't come from Messenger
            console.log(`[Send Order Public] No PSID stored for order ${orderId}, user did not come from Messenger`)
            return NextResponse.json({
                success: false,
                message: 'No Messenger PSID available. User did not come from Messenger.',
            })
        }

        // Check if message was already sent
        if (order.customer_data?.messenger_message_sent_at) {
            console.log(`[Send Order Public] Message already sent for order ${orderId}`)
            return NextResponse.json({
                success: true,
                message: 'Message already sent',
                alreadySent: true,
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
            console.log(`[Send Order Public] No Facebook page connected for tenant ${tenantId}`)
            return NextResponse.json({
                success: false,
                message: 'No Facebook page connected',
            })
        }

        // Get Facebook page access token
        const { data: pageData } = await supabase
            .from('facebook_pages')
            .select('page_access_token')
            .eq('id', tenant.facebook_page_id)
            .eq('is_active', true)
            .single()

        if (!pageData) {
            return NextResponse.json({
                success: false,
                message: 'Facebook page not found or inactive',
            })
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
            // Mark as sent - check for errors to prevent duplicate sends
            const { error: updateError } = await supabase
                .from('orders')
                .update({
                    customer_data: {
                        ...(order.customer_data || {}),
                        messenger_psid: storedPsid,
                        messenger_sender_id: storedPsid,
                        messenger_message_sent_at: new Date().toISOString(),
                        messenger_sent_proactively: true,
                    },
                } as unknown as never)
                .eq('id', orderId)

            if (updateError) {
                // Safe masking: only reveal last 4 chars if PSID is longer than 4, otherwise use fixed mask
                const maskedPsid = storedPsid.length > 4
                    ? `****${storedPsid.slice(-4)}`
                    : '********'
                console.error(`[Send Order Public] ❌ Failed to update order ${orderId} (PSID: ${maskedPsid}) after sending message:`, updateError.message)
                return NextResponse.json(
                    {
                        success: true,
                        message: 'Message sent but failed to update order record',
                        warning: 'Order may not be marked as sent; potential duplicate on retry'
                    },
                    { status: 207 } // Multi-Status: partial success
                )
            }

            // Log success without exposing PSID
            console.log(`[Send Order Public] ✅ Order message sent for order: ${orderId}`)
            return NextResponse.json({ success: true, message: 'Order message sent' })
        } else {
            console.error(`[Send Order Public] ❌ Failed to send message for order: ${orderId}`)
            return NextResponse.json({
                success: false,
                error: 'Failed to send message via Facebook API',
            })
        }
    } catch (error) {
        console.error('[Send Order Public] ❌ Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
