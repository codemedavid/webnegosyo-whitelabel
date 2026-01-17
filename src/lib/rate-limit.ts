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
 * Handles various proxy headers
 */
export function getClientIP(request: Request): string {
    // Try various headers that might contain the real IP
    const forwardedFor = request.headers.get('x-forwarded-for')
    if (forwardedFor) {
        // x-forwarded-for can contain multiple IPs, take the first one
        return forwardedFor.split(',')[0].trim()
    }

    const realIP = request.headers.get('x-real-ip')
    if (realIP) {
        return realIP
    }

    // Vercel-specific header
    const vercelIP = request.headers.get('x-vercel-forwarded-for')
    if (vercelIP) {
        return vercelIP.split(',')[0].trim()
    }

    // Fallback to a default identifier if no IP found
    return 'unknown'
}
