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

// In-memory cache for tenant existence validation
// Map<slug, { exists: boolean, expires: number }>
const tenantExistenceCache = new Map<string, { exists: boolean; expires: number }>()
const TENANT_EXISTENCE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Debug logging helper - only logs in development or when DEBUG_TENANT_RESOLUTION is set
 */
function debugLog(message: string, data?: Record<string, unknown>): void {
	const isDebug = process.env.NODE_ENV === 'development' || process.env.DEBUG_TENANT_RESOLUTION === 'true'
	if (isDebug) {
		if (data) {
			console.log(`[Tenant Resolution] ${message}`, data)
		} else {
			console.log(`[Tenant Resolution] ${message}`)
		}
	}
}

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

/**
 * Get and normalize host header from request
 * Handles multiple forwarded headers, ports, and edge cases
 */
function getHost(request: NextRequest): string {
	// Try x-forwarded-host first (for proxies/CDNs), then fall back to host
	const forwardedHost = request.headers.get('x-forwarded-host')
	const host = request.headers.get('host')
	
	const rawHost = forwardedHost || host || ''
	
	// Normalize: lowercase, trim whitespace, remove any trailing slashes or paths
	let normalized = rawHost.toLowerCase().trim()
	
	// Remove port if present (e.g., localhost:3000, example.com:443)
	normalized = normalized.split(':')[0]
	
	// Remove any path or query that might have been included
	normalized = normalized.split('/')[0]
	normalized = normalized.split('?')[0]
	
	// Remove any trailing dots or special characters
	normalized = normalized.replace(/[.\s]+$/, '')
	
	return normalized
}

export function getRootDomain(): string | null {
	// Example: example.com
	// In Vercel, set this to your root domain (not including protocol)
	return process.env.PLATFORM_ROOT_DOMAIN || null
}

/**
 * Extract subdomain from host header
 * Handles case-insensitive matching, port variations, and edge cases
 */
export function extractSubdomain(host: string, rootDomain: string | null): string | null {
    if (!host) return null

    // Host should already be normalized by getHost(), but ensure it's clean
    const hostClean = host.toLowerCase().trim()
    if (!hostClean) return null

    // Local dev support: <tenant>.localhost
    if (hostClean.endsWith('.localhost')) {
        const parts = hostClean.split('.')
        if (parts.length >= 2) {
            const sub = parts[0].toLowerCase()
            if (sub && !RESERVED_SUBDOMAINS.has(sub)) {
                return sub
            }
        }
        return null
    }

    // Production: <tenant>.<rootDomain>
    if (rootDomain) {
        const rootDomainLower = rootDomain.toLowerCase().trim()
        const suffix = '.' + rootDomainLower
        
        // Case-insensitive matching: check if host ends with .rootDomain
        if (hostClean.endsWith(suffix)) {
            // Extract subdomain: everything before the last occurrence of .rootDomain
            const subdomainPart = hostClean.slice(0, -suffix.length)
            
            // Get the last part (handles multi-level subdomains like a.b.example.com)
            const parts = subdomainPart.split('.')
            const sub = parts[parts.length - 1]?.toLowerCase() || null
            
            if (!sub) return null
            
            // Check if it's a reserved subdomain
            if (RESERVED_SUBDOMAINS.has(sub)) return null
            
            return sub
        }
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
	if (!normalizedHost) {
		debugLog('Custom domain normalization failed', { host })
		return null
	}
	
	debugLog('Checking custom domain', { host, normalizedHost })
	
	// Check cache first
	const cached = domainCache.get(normalizedHost)
	if (cached && cached.expires > Date.now()) {
		debugLog('Custom domain cache hit', { host, normalizedHost, slug: cached.slug })
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
			debugLog('Custom domain not found in database', { host, normalizedHost, error: error?.message })
			return null
		}
		
		// Cache the result (cache both normalized and www variant)
		const expires = Date.now() + CACHE_TTL
		domainCache.set(normalizedHost, { slug: data.slug, expires })
		if (data.domain !== normalizedHost) {
			domainCache.set(wwwVariant, { slug: data.slug, expires })
		}
		
		debugLog('Custom domain resolved successfully', { host, normalizedHost, slug: data.slug })
		return data.slug
	} catch (error) {
		// If database query fails, don't block request
		debugLog('Error resolving tenant by custom domain', { host, normalizedHost, error: error instanceof Error ? error.message : String(error) })
		return null
	}
}

/**
 * Validate if a tenant exists and is active
 * Uses in-memory cache to avoid database queries on every request
 */
export async function validateTenantExists(slug: string): Promise<boolean> {
	if (!slug) return false
	
	// Check cache first
	const cached = tenantExistenceCache.get(slug)
	if (cached && cached.expires > Date.now()) {
		debugLog(`Tenant existence cache hit for slug: ${slug}`, { exists: cached.exists })
		return cached.exists
	}
	
	// Query database
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
		
		const { data, error } = await supabase
			.from('tenants')
			.select('id, slug, is_active')
			.eq('slug', slug)
			.eq('is_active', true)
			.maybeSingle()
		
		if (error) {
			debugLog(`Error validating tenant existence for slug: ${slug}`, { error: error.message })
			return false
		}
		
		const exists = !!data && data.is_active
		
		// Cache the result
		const expires = Date.now() + TENANT_EXISTENCE_CACHE_TTL
		tenantExistenceCache.set(slug, { exists, expires })
		
		debugLog(`Tenant validation result for slug: ${slug}`, { exists })
		
		return exists
	} catch (error) {
		debugLog(`Exception validating tenant existence for slug: ${slug}`, { error: error instanceof Error ? error.message : String(error) })
		return false
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

/**
 * Clear tenant existence cache entry (useful when tenant is updated/deleted)
 */
export function clearTenantExistenceCache(slug: string | null): void {
	if (!slug) return
	tenantExistenceCache.delete(slug)
}

export async function resolveTenantSlugFromRequest(request: NextRequest): Promise<string | null> {
	const host = getHost(request)
	const rootDomain = getRootDomain()
	
	debugLog('Starting tenant resolution', { host, rootDomain: rootDomain || 'not configured' })
	
	// Priority 1: Check custom domain first
	const customDomainSlug = await resolveTenantByCustomDomain(host)
	if (customDomainSlug) {
		debugLog('Tenant resolved via custom domain', { host, slug: customDomainSlug })
		return customDomainSlug
	}
	
	// Priority 2: Fall back to subdomain extraction
	const sub = extractSubdomain(host, rootDomain)
	if (sub) {
		debugLog('Subdomain extracted', { host, rootDomain, subdomain: sub })
		
		// Validate tenant exists before returning
		const exists = await validateTenantExists(sub)
		if (exists) {
			debugLog('Tenant validated successfully', { slug: sub })
			return sub
		} else {
			debugLog('Tenant does not exist or is inactive', { slug: sub })
			return null
		}
	}
	
	debugLog('No tenant found', { host, rootDomain: rootDomain || 'not configured' })
	return null
}

/**
 * Server-side helper to get tenant slug from headers
 * Can be used in Server Components to detect tenant subdomains
 */
export async function getTenantSlugFromHeaders(): Promise<string | null> {
	// This function can be called from Server Components
	// We need to import headers dynamically to avoid issues
	const { headers } = await import('next/headers')
	const headersList = await headers()
	
	const host = (
		headersList.get('x-forwarded-host') ||
		headersList.get('host') ||
		''
	).toLowerCase()
	
	if (!host) return null
	
	const rootDomain = getRootDomain()
	const sub = extractSubdomain(host, rootDomain)
	
	if (sub) {
		// Validate tenant exists
		const exists = await validateTenantExists(sub)
		if (exists) {
			return sub
		}
	}
	
	// Also check custom domain
	const customDomainSlug = await resolveTenantByCustomDomain(host)
	return customDomainSlug
}
