/**
 * Simple in-memory rate limiter for API endpoints
 * 
 * Note: This is a basic implementation suitable for single-instance deployments.
 * For multi-instance deployments, consider using Redis or a distributed rate limiter.
 */

interface RateLimitEntry {
    count: number
    resetTime: number
}

// In-memory store for rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up old entries periodically (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanupOldEntries() {
    const now = Date.now()
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
        return
    }

    lastCleanup = now
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetTime < now) {
            rateLimitStore.delete(key)
        }
    }
}

export interface RateLimitConfig {
    /** Maximum number of requests allowed in the window */
    maxRequests: number
    /** Time window in milliseconds */
    windowMs: number
}

export interface RateLimitResult {
    allowed: boolean
    remaining: number
    resetTime: number
}

/**
 * Check rate limit for a given identifier (e.g., IP address)
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
): RateLimitResult {
    cleanupOldEntries()

    const now = Date.now()
    const key = `ratelimit:${identifier}`

    let entry = rateLimitStore.get(key)

    // Initialize or reset if window expired
    if (!entry || entry.resetTime < now) {
        entry = {
            count: 0,
            resetTime: now + config.windowMs,
        }
    }

    // Increment count
    entry.count++
    rateLimitStore.set(key, entry)

    const allowed = entry.count <= config.maxRequests
    const remaining = Math.max(0, config.maxRequests - entry.count)

    return {
        allowed,
        remaining,
        resetTime: entry.resetTime,
    }
}

/**
 * Get client IP from Next.js request
 * Handles various proxy headers with priority for trusted providers
 * 
 * Priority order:
 * 1. Vercel-specific header (x-vercel-forwarded-for) - most trusted in Vercel environment
 * 2. Cloudflare header (cf-connecting-ip) - trusted when behind Cloudflare
 * 3. x-real-ip - commonly set by trusted reverse proxies
 * 4. x-forwarded-for - generic header, use first IP (client IP)
 * 
 * @returns The client IP address, or null if no IP could be determined
 */
export function getClientIP(request: Request): string | null {
    // 1. Vercel-specific header (most trusted in Vercel deployments)
    const vercelIP = request.headers.get('x-vercel-forwarded-for')
    if (vercelIP) {
        const ip = vercelIP.split(',')[0].trim()
        if (ip) return ip
    }

    // 2. Cloudflare header (trusted when using Cloudflare)
    const cfConnectingIP = request.headers.get('cf-connecting-ip')
    if (cfConnectingIP) {
        const ip = cfConnectingIP.trim()
        if (ip) return ip
    }

    // 3. x-real-ip (commonly set by nginx and other proxies)
    const realIP = request.headers.get('x-real-ip')
    if (realIP) {
        const ip = realIP.trim()
        if (ip) return ip
    }

    // 4. Generic x-forwarded-for (last resort, first IP is client)
    const forwardedFor = request.headers.get('x-forwarded-for')
    if (forwardedFor) {
        const ip = forwardedFor.split(',')[0].trim()
        if (ip) return ip
    }

    // No IP could be determined - return null so callers can handle appropriately
    return null
}
