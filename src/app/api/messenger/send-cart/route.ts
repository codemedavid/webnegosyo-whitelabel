import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMessage } from '@/lib/facebook-api'
import { formatPrice } from '@/lib/cart-utils'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

// CORS headers for cross-origin requests from tenant subdomains
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/**
 * OPTIONS /api/messenger/send-cart
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: corsHeaders,
    })
}

/**
 * Helper to return JSON response with CORS headers
 */
function corsJson(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    return NextResponse.json(data, {
        ...init,
        headers: {
            ...corsHeaders,
            ...init?.headers,
        },
    })
}

interface CartItemForSync {
    name: string
    quantity: number
    subtotal: number
    variation?: string
}

/**
 * Verify that a PSID is associated with a tenant by checking the messenger_sessions table.
 * This ensures we only send messages to users who have an existing session with the tenant.
 * 
 * @param supabase - Supabase client instance
 * @param psid - The Page-Scoped ID of the user
 * @param tenantId - The tenant ID to verify against
 * @returns true if the PSID has an existing session with the tenant, false otherwise
 */
async function verifyPSIDForTenant(
    supabase: Awaited<ReturnType<typeof createClient>>,
    psid: string,
    tenantId: string
): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('messenger_sessions')
            .select('id')
            .eq('psid', psid)
            .eq('tenant_id', tenantId)
            .single()

        if (error || !data) {
            return false
        }

        return true
    } catch {
        return false
    }
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
        if (!clientIP) {
            return corsJson(
                { error: 'Unable to verify client IP address' },
                { status: 400 }
            )
        }
        const rateLimit = checkRateLimit(clientIP, { maxRequests: 20, windowMs: 60000 })

        if (!rateLimit.allowed) {
            return corsJson(
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
            return corsJson(
                { error: 'Missing tenantId or psid' },
                { status: 400 }
            )
        }

        // Validate tenantSlug with strict slug pattern
        // Trim and validate against regex to prevent malicious URL construction
        const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i
        const sanitizedTenantSlug = typeof tenantSlug === 'string' ? tenantSlug.trim() : ''

        if (!sanitizedTenantSlug || !slugRegex.test(sanitizedTenantSlug)) {
            return corsJson(
                { error: 'Invalid tenantSlug: must contain only alphanumeric characters and hyphens' },
                { status: 400 }
            )
        }

        // Validate items array
        if (!items || !Array.isArray(items)) {
            return corsJson(
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
                return corsJson(
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
            return corsJson(
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
            return corsJson({
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
            return corsJson({
                success: false,
                message: 'Facebook page not found or inactive',
            })
        }

        const page = pageData as { page_access_token: string }

        // Verify PSID is associated with this tenant before sending message
        const isPSIDValid = await verifyPSIDForTenant(supabase, psid, tenantId)
        if (!isPSIDValid) {
            const maskedPsid = psid.length >= 4 ? `****${psid.slice(-4)}` : '****'
            console.warn(`[Send Cart] ⚠️ PSID ${maskedPsid} not associated with tenant ${tenantId}`)
            return corsJson(
                { error: 'PSID not associated with tenant page' },
                { status: 403 }
            )
        }

        // Format cart summary message
        const message = formatCartSummary(items, tenant.name, sanitizedTenantSlug || tenant.slug)

        const sent = await sendMessage(
            psid,
            page.page_access_token,
            message
        )

        if (sent) {
            const maskedPsid = `****${psid.slice(-4)}`
            console.log(`[Send Cart] ✅ Cart summary sent to PSID: ${maskedPsid}`)
            return corsJson({ success: true })
        } else {
            console.error(`[Send Cart] ❌ Failed to send cart summary`)
            return corsJson({
                success: false,
                error: 'Failed to send message',
            })
        }
    } catch (error) {
        console.error('[Send Cart] ❌ Error:', error)
        return corsJson(
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
