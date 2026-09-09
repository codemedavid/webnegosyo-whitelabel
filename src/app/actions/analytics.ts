'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { resolveOrderBackend, type OrderBackendPreference } from '@/lib/order-backend'
import type { Json } from '@/types/supabase'

/** Event types are short identifiers (`upsell_shown`); anything else is junk. */
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

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
    if (!EVENT_TYPE_PATTERN.test(eventType)) {
      console.warn('[Analytics] Dropped event with malformed type')
      return
    }

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
        .insert({ tenant_id: tenantId, type: eventType, metadata: (metadata ?? {}) as Json })
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
      metadata: metadata ?? {},
    })
  } catch (error) {
    console.error('[Analytics] Failed to track event:', eventType, error instanceof Error ? error.message : error)
  }
}
