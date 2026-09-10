/**
 * Order token utilities for secure public order endpoints
 *
 * Generates and verifies short-lived cryptographic tokens for order verification
 * to prevent relying on order UUIDs as secrets.
 */

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

// Token TTL in milliseconds (15 minutes)
const TOKEN_TTL_MS = 15 * 60 * 1000

/**
 * The slice of Supabase these helpers touch.
 *
 * Callers may inject their own client — `createOrder` already holds a
 * service-role writer for the very order being tokenised, so it can hand that
 * one over instead of paying for a second connection.
 */
export type OrderTokenClient = Pick<SupabaseClient<Database>, 'from'>

/**
 * Every statement below runs through the SERVICE ROLE, not the visitor's cookie
 * session.
 *
 * `public.orders` grants `anon` an INSERT policy and nothing else — no anon
 * UPDATE, no anon SELECT. On the cookie client the token UPDATE therefore
 * matched zero rows and returned NO error, so an anonymous checkout got
 * `undefined` back and the proactive Messenger message to the merchant was
 * never sent; verification then failed for every anonymous caller. A token was
 * minted only when the visitor happened to also hold a merchant or superadmin
 * login in the same browser. The token itself is the security boundary for the
 * public endpoints that consume it; RLS never was.
 */
function createDefaultOrderTokenClient(): OrderTokenClient {
    return createAdminClient()
}

/** A freshly minted token plus the hash and expiry that get persisted. */
export interface OrderTokenPair {
    /** Plaintext token — returned to the caller, never stored. */
    token: string
    /** SHA-256 of the token — this is what the order row holds. */
    tokenHash: string
    expiresAt: string
}

/**
 * Mint a token without touching any database.
 *
 * Split out so the per-tenant Supabase order path can write the hash directly
 * into its INSERT (see `src/lib/tenant-supabase-orders.ts`) instead of issuing a
 * follow-up UPDATE against the platform project, which is the wrong database
 * entirely for those orders.
 */
export function generateOrderTokenPair(): OrderTokenPair {
    // Generate a random 32-byte token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

    // Store token hash with the order (we store hash, not plain token)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    return { token, tokenHash, expiresAt }
}

/**
 * Generate a cryptographically secure order token
 * Stores the token with the order for later verification
 */
export async function createOrderToken(
    orderId: string,
    client: OrderTokenClient = createDefaultOrderTokenClient()
): Promise<string> {
    const { token, tokenHash, expiresAt } = generateOrderTokenPair()

    // Update order with token and check for errors
    // Use count: 'exact' to get the number of affected rows for validation
    const { error, count } = await client
        .from('orders')
        .update(
            {
                order_token_hash: tokenHash,
                order_token_expires_at: expiresAt,
            } as never,
            { count: 'exact' }
        )
        .eq('id', orderId)

    // Check if update failed or no rows were affected
    if (error) {
        console.error('[Order Token] Failed to store token:', error.message)
        throw new Error(`Failed to create order token: ${error.message}`)
    }

    if (count !== null && count === 0) {
        console.error('[Order Token] No order found with id:', orderId)
        throw new Error(`Failed to create order token: Order not found`)
    }

    return token
}

/**
 * Verify an order token
 * Returns true if token is valid and not expired
 */
export async function verifyOrderToken(
    orderId: string,
    token: string,
    client: OrderTokenClient = createDefaultOrderTokenClient()
): Promise<boolean> {
    if (!token || !orderId) {
        return false
    }

    // Hash the provided token for comparison
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Get order with token info
    const { data: order, error } = await client
        .from('orders')
        .select('order_token_hash, order_token_expires_at')
        .eq('id', orderId)
        .single()

    if (error || !order) {
        return false
    }

    const orderData = order as { order_token_hash?: string; order_token_expires_at?: string }

    // Check if token exists
    if (!orderData.order_token_hash) {
        return false
    }

    // Require expiry to be present when token hash exists
    if (!orderData.order_token_expires_at) {
        return false
    }

    // Parse and validate expiry date
    const expiresAt = new Date(orderData.order_token_expires_at)
    if (isNaN(expiresAt.getTime())) {
        // Invalid date format
        return false
    }

    // Check if token expired
    if (expiresAt < new Date()) {
        return false
    }

    // Compare token hashes using timing-safe comparison
    try {
        const expectedHash = Buffer.from(orderData.order_token_hash, 'hex')
        const providedHash = Buffer.from(tokenHash, 'hex')
        return crypto.timingSafeEqual(expectedHash, providedHash)
    } catch {
        return false
    }
}

/**
 * Clear the order token (after successful use or for security)
 */
export async function clearOrderToken(
    orderId: string,
    client: OrderTokenClient = createDefaultOrderTokenClient()
): Promise<void> {
    const { error } = await client
        .from('orders')
        .update({
            order_token_hash: null,
            order_token_expires_at: null,
        } as never)
        .eq('id', orderId)

    // Best-effort by design — the token expires on its own within
    // TOKEN_TTL_MS — but a failure still gets said out loud rather than
    // swallowed, because a token that outlives its intended use is a
    // security fact somebody may need to see in the logs.
    if (error) {
        console.error('[Order Token] Failed to clear token for order:', orderId, error.message)
    }
}
