import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMessage } from '@/lib/facebook-api'
import { formatPrice } from '@/lib/cart-utils'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

interface CartItemForSync {
    name: string
    quantity: number
    subtotal: number
    variation?: string
}

/**
 * POST /api/messenger/send-cart
 * 
 * Public endpoint for sending cart summary to Messenger
 * Called when cart items are added/removed (debounced on client)
 */
export async function POST(request: NextRequest) {
    try {
        // Rate limiting - 20 requests per minute per IP
        const clientIP = getClientIP(request)
        const rateLimit = checkRateLimit(clientIP, { maxRequests: 20, windowMs: 60000 })

        if (!rateLimit.allowed) {
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

        const body = await request.json()
        const { tenantId, psid, items, tenantSlug } = body as {
            tenantId: string
            psid: string
            items: CartItemForSync[]
            tenantSlug: string
        }

        // Validate required fields
        if (!tenantId || !psid) {
            return NextResponse.json(
                { error: 'Missing tenantId or psid' },
                { status: 400 }
            )
        }

        // Validate tenantSlug
        if (!tenantSlug || typeof tenantSlug !== 'string' || tenantSlug.trim() === '') {
            return NextResponse.json(
                { error: 'Invalid tenantSlug: must be a non-empty string' },
                { status: 400 }
            )
        }

        // Validate items array
        if (!items || !Array.isArray(items)) {
            return NextResponse.json(
                { error: 'Invalid items: must be an array' },
                { status: 400 }
            )
        }

        // Validate each item has required properties
        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (
                typeof item.name !== 'string' ||
                typeof item.quantity !== 'number' ||
                typeof item.subtotal !== 'number'
            ) {
                return NextResponse.json(
                    { error: `Invalid item at index ${i}: must have name (string), quantity (number), and subtotal (number)` },
                    { status: 400 }
                )
            }
        }

        const supabase = await createClient()

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
            domain?: string | null
            slug: string
        }

        if (!tenant.facebook_page_id) {
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

        // Format cart summary message
        const message = formatCartSummary(items, tenant.name, tenantSlug || tenant.slug)

        const sent = await sendMessage(
            psid,
            page.page_access_token,
            message
        )

        if (sent) {
            console.log(`[Send Cart] ✅ Cart summary sent to PSID: ${psid}`)
            return NextResponse.json({ success: true })
        } else {
            console.error(`[Send Cart] ❌ Failed to send cart summary`)
            return NextResponse.json({
                success: false,
                error: 'Failed to send message',
            })
        }
    } catch (error) {
        console.error('[Send Cart] ❌ Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

function formatCartSummary(
    items: CartItemForSync[],
    tenantName: string,
    tenantSlug: string
): string {
    if (items.length === 0) {
        return `🛒 Your cart at ${tenantName} is empty.\n\nBrowse our menu and add some items!`
    }

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
    const total = items.reduce((sum, item) => sum + item.subtotal, 0)

    let message = `🛒 Your Cart at ${tenantName}\n`
    message += `${itemCount} item${itemCount !== 1 ? 's' : ''}\n`
    message += `─────────────────\n\n`

    for (const item of items) {
        const variation = item.variation ? ` (${item.variation})` : ''
        message += `${item.quantity}x ${item.name}${variation}\n`
        message += `   ${formatPrice(item.subtotal)}\n\n`
    }

    message += `─────────────────\n`
    message += `💰 Total: ${formatPrice(total)}\n\n`

    // Build checkout URL
    const rootDomain = process.env.PLATFORM_ROOT_DOMAIN || 'webnegosyo.app'
    const checkoutUrl = `https://${tenantSlug}.${rootDomain}/checkout`
    message += `Ready to order?\n${checkoutUrl}`

    return message
}
