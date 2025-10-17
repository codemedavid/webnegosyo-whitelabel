// Tenant resolver utilities for subdomain-based multi-tenancy

import type { NextRequest } from 'next/server'
import { getTenantBySlugSupabase } from '@/lib/tenants-service'

// Reserved subdomains that should never be treated as tenant slugs
const RESERVED_SUBDOMAINS = new Set([
	'www',
	'superadmin',
	'app',
	'admin',
])

function getHost(request: NextRequest): string {
	return (
		request.headers.get('x-forwarded-host') ||
		request.headers.get('host') ||
		''
	).toLowerCase()
}

function getRootDomain(): string | null {
	// Example: example.com
	// In Vercel, set this to your root domain (not including protocol)
	return process.env.PLATFORM_ROOT_DOMAIN || null
}

export function extractSubdomain(host: string, rootDomain: string | null): string | null {
    if (!host) return null

    // Strip port if present (e.g., localhost:3003)
    const hostNoPort = host.split(':')[0]

    // Local dev support: <tenant>.localhost
    if (hostNoPort.endsWith('.localhost')) {
        const parts = hostNoPort.split('.')
        if (parts.length >= 2) {
            const sub = parts[0]
            return RESERVED_SUBDOMAINS.has(sub) ? null : sub
        }
        return null
    }

    // Vercel preview/custom domains: <tenant>.<rootDomain>
    if (rootDomain && hostNoPort.endsWith('.' + rootDomain)) {
        const sub = hostNoPort.slice(0, -1 * (rootDomain.length + 1)).split('.').pop() || null
        if (!sub) return null
        return RESERVED_SUBDOMAINS.has(sub) ? null : sub
    }

    // If no root domain configured, attempt generic extraction (take first label)
    const generic = hostNoPort.split('.')[0]
    return RESERVED_SUBDOMAINS.has(generic) ? null : generic
}

export function resolveTenantSlugFromRequest(request: NextRequest): string | null {
	const host = getHost(request)
	const rootDomain = getRootDomain()
	const sub = extractSubdomain(host, rootDomain)
  if (!sub) return null

  // Do not block on DB during middleware hot path; accept the slug and let the page load handle 404
  return sub
}
