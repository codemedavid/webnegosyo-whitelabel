import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActivePageById } from '@/lib/facebook/page-tokens'
import { sendMessage } from '@/lib/facebook-api'
import { getClientIP } from '@/lib/rate-limit'
import { checkRateLimit } from '@/lib/distributed-rate-limit'

/**
 * Get CORS headers with origin validation against platform root domain.
 * Only allows origins matching the tenant subdomain pattern.
 */
function getCorsHeaders(request: NextRequest): Record<string, string> {
    const origin = request.headers.get('origin') || ''
    const rootDomain = process.env.PLATFORM_ROOT_DOMAIN || 'webnegosyo.app'

    // Escape dots in domain for regex and build pattern
    // Matches: https://tenant.webnegosyo.app or https://webnegosyo.app — and
    // nothing longer. Anchored at the end: an unanchored pattern also matched
    // https://tenant.webnegosyo.app.attacker.example.
    const escapedDomain = rootDomain.replace(/\./g, '\\.')
    const originPattern = new RegExp(`^https://([a-z0-9-]+\\.)?${escapedDomain}(:\\d+)?$`, 'i')

    const allowedOrigin = originPattern.test(origin) ? origin : ''

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        ...(allowedOrigin ? { 'Vary': 'Origin' } : {}),
    }
}

/**
 * OPTIONS /api/messenger/send-cart
 * Handle CORS preflight requests
 */
export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 204,
        headers: getCorsHeaders(request),
    })
}

/**
 * Helper to return JSON response with CORS headers
 */
function corsJson(request: NextRequest, data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    return NextResponse.json(data, {
        ...init,
        headers: {
            ...getCorsHeaders(request),
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

/** Payload bounds: this route is public and its text is relayed to Messenger. */
const MAX_CART_ITEMS = 100
const MAX_ITEM_NAME_LENGTH = 200
const MAX_VARIATION_LENGTH = 300
const MAX_ITEM_QUANTITY = 999
const MAX_ITEM_SUBTOTAL = 10_000_000
/** Tenant ids are UUIDs and PSIDs ~17 digits; anything longer is not either. */
const MAX_ID_LENGTH = 64

const SEND_CART_RATE_LIMIT = { limit: 20, windowSec: 60 }
/**
 * Per person, whatever the caller IP: a customer adding dishes triggers one send
 * per 5 s debounce, so this only ever stops someone aiming at a stranger's PSID.
 */
const PER_PERSON_RATE_LIMIT = { limit: 6, windowSec: 300 }
/** The same count twice in a row says nothing new. */
const SAME_COUNT_WINDOW = { limit: 1, windowSec: 60 }

function isValidCartItem(item: unknown): item is CartItemForSync {
    if (!item || typeof item !== 'object') return false
    const candidate = item as Record<string, unknown>
    const { name, quantity, subtotal, variation } = candidate
    return (
        typeof name === 'string' &&
        name.length <= MAX_ITEM_NAME_LENGTH &&
        typeof quantity === 'number' &&
        Number.isFinite(quantity) &&
        quantity >= 0 &&
        quantity <= MAX_ITEM_QUANTITY &&
        typeof subtotal === 'number' &&
        Number.isFinite(subtotal) &&
        subtotal >= 0 &&
        subtotal <= MAX_ITEM_SUBTOTAL &&
        (variation === undefined ||
            variation === null ||
            (typeof variation === 'string' && variation.length <= MAX_VARIATION_LENGTH))
    )
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
    psid: string,
    tenantId: string
): Promise<boolean> {
    try {
        // Service role: this route is public, so there is no session to read
        // the session table with. Scoped to the one psid/tenant pair being
        // verified, which is the whole question being asked.
        const { data, error } = await createAdminClient()
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
            return corsJson(request,
                { error: 'Unable to verify client IP address' },
                { status: 400 }
            )
        }
        const rateLimit = await checkRateLimit(`send-cart:${clientIP}`, SEND_CART_RATE_LIMIT)

        if (!rateLimit.allowed) {
            return corsJson(request,
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(rateLimit.retryAfterSec),
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
                return corsJson(request,
                    { error: 'Invalid JSON in request body' },
                    { status: 400 }
                )
            }
            throw parseError // Re-throw non-JSON errors for outer catch
        }

        // `tenantSlug` may still arrive from older clients; it is ignored. The
        // checkout link is built from the tenant row resolved below, so a caller
        // cannot make the store's Page message a link to somewhere else.
        const { tenantId, psid, items } = body as {
            tenantId: unknown
            psid: unknown
            items: unknown
        }

        // Validate required fields
        if (
            typeof tenantId !== 'string' || !tenantId || tenantId.length > MAX_ID_LENGTH ||
            typeof psid !== 'string' || !psid || psid.length > MAX_ID_LENGTH
        ) {
            return corsJson(request,
                { error: 'Missing tenantId or psid' },
                { status: 400 }
            )
        }

        // Validate items array
        if (!Array.isArray(items) || items.length > MAX_CART_ITEMS) {
            return corsJson(request,
                { error: `Invalid items: must be an array of at most ${MAX_CART_ITEMS}` },
                { status: 400 }
            )
        }

        // Validate each item has required, bounded properties
        const invalidIndex = items.findIndex((item) => !isValidCartItem(item))
        if (invalidIndex !== -1) {
            return corsJson(request,
                { error: `Invalid item at index ${ invalidIndex }: must have a short name, a quantity and a subtotal` },
                { status: 400 }
            )
        }
        const cartItems = items as CartItemForSync[]

        const supabase = await createClient()

        // Get tenant and Facebook page — select only the fields we need, never expose
        // sensitive columns like API keys via select('*')
        const { data: tenantData } = await supabase
            .from('tenants')
            .select('id, name, slug, domain, facebook_page_id, is_active')
            .eq('id', tenantId)
            .eq('is_active', true)
            .single()

        if (!tenantData) {
            return corsJson(request,
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
            return corsJson(request,
                { success: false, message: 'No Facebook page connected' },
                { status: 400 }
            )
        }

        // Get Facebook page access token
        const pageData = await getActivePageById(tenant.facebook_page_id)

        if (!pageData) {
            return corsJson(request,
                { success: false, message: 'Facebook page not found or inactive' },
                { status: 404 }
            )
        }

        const page = pageData as { page_access_token: string }

        // Verify PSID is associated with this tenant before sending message
        const isPSIDValid = await verifyPSIDForTenant(psid, tenantId)
        if (!isPSIDValid) {
            const maskedPsid = psid.length >= 4 ? `**** ${ psid.slice(-4) }` : '****'
            console.warn(`[Send Cart] ⚠️ PSID ${ maskedPsid } not associated with tenant ${ tenantId } `)
            return corsJson(request,
                { error: 'PSID not associated with tenant page' },
                { status: 403 }
            )
        }

        // Hashed: limiter keys reach the logs on a Redis error, and PSIDs stay masked there.
        const person = createHash('sha256').update(psid).digest('hex').slice(0, 24)
        const personLimit = await checkRateLimit(`send-cart-psid:${tenantId}:${person}`, PER_PERSON_RATE_LIMIT)
        if (!personLimit.allowed) {
            return corsJson(request,
                { error: 'Too many requests. Please try again later.' },
                { status: 429, headers: { 'Retry-After': String(personLimit.retryAfterSec) } }
            )
        }
        const sameCount = await checkRateLimit(
            `send-cart-same:${tenantId}:${person}:${countItems(cartItems)}`,
            SAME_COUNT_WINDOW
        )
        if (!sameCount.allowed) {
            return corsJson(request, { success: true, duplicate: true })
        }

        const message = formatCartSummary(cartItems, tenant.name, tenant.slug)

        const sent = await sendMessage(
            psid,
            page.page_access_token,
            message
        )

        if (sent) {
            const maskedPsid = psid.length >= 4 ? `**** ${ psid.slice(-4) } ` : '****'
            console.log(`[Send Cart] ✅ Cart summary sent to PSID: ${ maskedPsid } `)
            return corsJson(request, { success: true })
        } else {
            console.error(`[Send Cart] ❌ Failed to send cart summary`)
            return corsJson(request, {
                success: false,
                error: 'Failed to send message',
            })
        }
    } catch (error) {
        console.error('[Send Cart] ❌ Error:', error)
        return corsJson(request,
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * Only server-known text goes out: the store's name, a count and the checkout
 * link. This route is public, so naming dishes or prices from the request let
 * anyone who knows a PSID make the store's Page say whatever they wrote.
 */
function formatCartSummary(items: CartItemForSync[], tenantName: string, tenantSlug: string): string {
    if (items.length === 0) {
        return `🛒 Your cart at ${ tenantName } is empty.\n\nBrowse our menu and add some items!`
    }

    const itemCount = countItems(items)
    const rootDomain = process.env.PLATFORM_ROOT_DOMAIN || 'webnegosyo.app'
    const checkoutUrl = `https://${tenantSlug}.${rootDomain}/checkout`
    return `🛒 Your cart at ${ tenantName }: ${ itemCount } item${ itemCount !== 1 ? 's' : '' }.\n\nReady to order?\n${checkoutUrl}`
}

function countItems(items: CartItemForSync[]): number {
    return items.reduce((sum, item) => sum + Math.max(0, Math.round(item.quantity)), 0)
}
