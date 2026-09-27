'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { resolveOrderBackend, type OrderBackendPreference } from '@/lib/order-backend'
import { checkActionRateLimit } from '@/lib/action-rate-limit'
import type { Json } from '@/types/supabase'

/** Event types are short identifiers (`upsell_shown`); anything else is junk. */
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

/**
 * This is a public action, so its payload is bounded. The storefront's own
 * events carry a handful of ids and counts (well under 1 KB); an unbounded
 * object let an anonymous script write arbitrarily large rows into
 * `analytics_events` or the tenant's Convex deployment.
 */
const MAX_ANALYTICS_METADATA_BYTES = 4096

/** Generous for a browsing customer (every offer impression is one event). */
const ANALYTICS_CLIENT_RATE_LIMIT = { limit: 120, windowSec: 60 }

/** A plain JSON object within the size cap, or null when it must be dropped. */
function boundedMetadata(metadata: unknown): Record<string, unknown> | null {
  if (metadata === undefined || metadata === null) return {}
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return null
  try {
    const serialized = JSON.stringify(metadata)
    return Buffer.byteLength(serialized, 'utf8') <= MAX_ANALYTICS_METADATA_BYTES
      ? (JSON.parse(serialized) as Record<string, unknown>)
      : null
  } catch {
    // Cyclic or otherwise unserialisable.
    return null
  }
}

interface TenantBackendRow {
  convex_deployment_url: string | null
  order_backend: OrderBackendPreference | null
}

/**
 * Record a storefront analytics event on whichever backend holds the tenant's
 * orders — the same rule the merchant app reads by, so the event lands where
 * the Analytics screen will look for it. Never throws: analytics must not
 * break a customer's checkout.
 */
export async function trackAnalyticsEventAction(
  tenantId: string,
  eventType: string,
  metadata?: Record<string, unknown>
) {
  try {
    if (typeof tenantId !== 'string' || tenantId === '' || typeof eventType !== 'string') return
    if (!EVENT_TYPE_PATTERN.test(eventType)) {
      console.warn('[Analytics] Dropped event with malformed type')
      return
    }
    const safeMetadata = boundedMetadata(metadata)
    if (!safeMetadata) {
      console.warn('[Analytics] Dropped event with oversized or malformed metadata', { eventType })
      return
    }
    const rate = await checkActionRateLimit('analytics-event', ANALYTICS_CLIENT_RATE_LIMIT)
    if (!rate.allowed) return

    const supabaseAdmin = createAdminClient()
    const { data: tenantConfig } = await supabaseAdmin
      .from('tenants')
      .select('convex_deployment_url, order_backend')
      .eq('id', tenantId)
      .single()

    const config = (tenantConfig as TenantBackendRow | null) ?? null
    if (!config) return

    if (resolveOrderBackend(config) === 'platform') {
      const { error } = await supabaseAdmin
        .from('analytics_events')
        .insert({ tenant_id: tenantId, type: eventType, metadata: safeMetadata as Json })
      if (error) throw new Error(error.message)
      return
    }

    if (!config.convex_deployment_url) {
      return
    }

    const deployKey = (await getTenantSecrets(supabaseAdmin, tenantId))?.convex_deploy_key
    if (!deployKey) {
      return
    }

    const convex = createConvexServerClient(config.convex_deployment_url, deployKey)
    await convex.mutation('analytics:trackEvent', {
      type: eventType,
      metadata: safeMetadata,
    })
  } catch (error) {
    console.error('[Analytics] Failed to track event:', eventType, error instanceof Error ? error.message : error)
  }
}
