// Tenant resolver utilities for subdomain-based multi-tenancy

import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Reserved subdomains that should never be treated as tenant slugs
const RESERVED_SUBDOMAINS = new Set([
	'www',
	'superadmin',
	'app',
	'admin',
])

// In-memory cache for domain-to-tenant slug mappings
// Map<domain, { slug: string, expires: number }>
const domainCache = new Map<string, { slug: string; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Normalize domain to consistent format
 * - Remove protocol (http://, https://)
 * - Remove www. prefix
 * - Remove trailing slashes
 * - Convert to lowercase
 * Example: "https://www.Retiro.com/" → "retiro.com"
 */
export function normalizeDomain(domain: string | null | undefined): string | null {
	if (!domain) return null
	
	// Remove protocol
	let normalized = domain.replace(/^https?:\/\//i, '')
	
	// Remove www. prefix
	normalized = normalized.replace(/^www\./i, '')
	
	// Remove trailing slashes and whitespace
	normalized = normalized.replace(/\/+$/, '').trim()
	
	// Convert to lowercase
	normalized = normalized.toLowerCase()
	
	// Basic validation: must contain at least one dot
	if (!normalized.includes('.')) return null
	
	return normalized || null
}

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

    // If no root domain configured, don't extract subdomain from Vercel/other domains
    // This prevents treating "your-app.vercel.app" as a subdomain setup
    // Only extract subdomains when explicitly configured with PLATFORM_ROOT_DOMAIN
    return null
}

/**
 * Resolve tenant slug by custom domain from database
 * Uses in-memory cache to avoid database queries on every request
 */
async function resolveTenantByCustomDomain(host: string): Promise<string | null> {
	// Normalize host (remove port, then normalize domain format)
	const hostNoPort = host.split(':')[0]
	const normalizedHost = normalizeDomain(hostNoPort)
	if (!normalizedHost) return null
	
	// Check cache first
	const cached = domainCache.get(normalizedHost)
	if (cached && cached.expires > Date.now()) {
		return cached.slug
	}
	
	// Also check www variant (normalized)
	const wwwVariant = normalizedHost.startsWith('www.') 
		? normalizedHost.replace(/^www\./, '')
		: `www.${normalizedHost}`
	
	const cachedWww = domainCache.get(wwwVariant)
	if (cachedWww && cachedWww.expires > Date.now()) {
		return cachedWww.slug
	}
	
	// Query database for custom domain
	try {
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					getAll() {
						return []
					},
					setAll() {
						// No-op for middleware
					},
				},
			}
		)
		
		// Query for exact match or www variant
		// Try exact match first (using normalized domain)
		let { data, error } = await supabase
			.from('tenants')
			.select('slug, domain')
			.eq('is_active', true)
			.eq('domain', normalizedHost)
			.maybeSingle()
		
		// If not found, try www variant
		if (!data && !error) {
			const wwwResult = await supabase
				.from('tenants')
				.select('slug, domain')
				.eq('is_active', true)
				.eq('domain', wwwVariant)
				.maybeSingle()
			data = wwwResult.data
			error = wwwResult.error
		}
		
		if (error || !data || !data.domain) {
			return null
		}
		
		// Cache the result (cache both normalized and www variant)
		const expires = Date.now() + CACHE_TTL
		domainCache.set(normalizedHost, { slug: data.slug, expires })
		if (data.domain !== normalizedHost) {
			domainCache.set(wwwVariant, { slug: data.slug, expires })
		}
		
		return data.slug
	} catch (error) {
		// If database query fails, don't block request
		console.error('Error resolving tenant by custom domain:', error)
		return null
	}
}

/**
 * Clear domain cache entry (useful when tenant is updated/deleted)
 */
export function clearDomainCache(domain: string | null): void {
	if (!domain) return
	const normalized = normalizeDomain(domain)
	if (normalized) {
		domainCache.delete(normalized)
		// Also clear www variant
		const wwwVariant = normalized.startsWith('www.') 
			? normalized.replace(/^www\./, '')
			: `www.${normalized}`
		domainCache.delete(wwwVariant)
	}
}

export async function resolveTenantSlugFromRequest(request: NextRequest): Promise<string | null> {
	const host = getHost(request)
	
	// Priority 1: Check custom domain first
	const customDomainSlug = await resolveTenantByCustomDomain(host)
	if (customDomainSlug) {
		return customDomainSlug
	}
	
	// Priority 2: Fall back to subdomain extraction
	const rootDomain = getRootDomain()
	const sub = extractSubdomain(host, rootDomain)
	if (sub) {
		return sub
	}
	
	// No tenant found
	return null
}
