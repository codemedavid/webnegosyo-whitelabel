/**
 * Order token utilities for secure public order endpoints
 * 
 * Generates and verifies short-lived cryptographic tokens for order verification
 * to prevent relying on order UUIDs as secrets.
 */

import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'

// Token TTL in milliseconds (15 minutes)
const TOKEN_TTL_MS = 15 * 60 * 1000

/**
 * Generate a cryptographically secure order token
 * Stores the token with the order for later verification
 */
export async function createOrderToken(orderId: string): Promise<string> {
    const supabase = await createClient()

    // Generate a random 32-byte token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

    // Store token hash with the order (we store hash, not plain token)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Update order with token and check for errors
    // Use count: 'exact' to get the number of affected rows for validation
    const { error, count } = await supabase
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
export async function verifyOrderToken(orderId: string, token: string): Promise<boolean> {
    if (!token || !orderId) {
        return false
    }

    const supabase = await createClient()

    // Hash the provided token for comparison
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // Get order with token info
    const { data: order, error } = await supabase
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
export async function clearOrderToken(orderId: string): Promise<void> {
    const supabase = await createClient()

    await supabase
        .from('orders')
        .update({
            order_token_hash: null,
            order_token_expires_at: null,
        } as never)
        .eq('id', orderId)
}
