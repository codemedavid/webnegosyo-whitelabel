'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createConvexServerClient } from '@/lib/convex/server'

export async function trackAnalyticsEventAction(
  tenantId: string,
  eventType: string,
  metadata?: Record<string, unknown>
) {
  try {
    const supabaseAdmin = createAdminClient()
    const { data: tenantConfig } = await supabaseAdmin
      .from('tenants')
      .select('convex_deployment_url, convex_deploy_key')
      .eq('id', tenantId)
      .single()

    const config = tenantConfig as Record<string, string> | null
    if (!config?.convex_deployment_url || !config?.convex_deploy_key) {
      return
    }

    const convex = createConvexServerClient(config.convex_deployment_url, config.convex_deploy_key)
    await convex.mutation('analytics:trackEvent', {
      type: eventType,
      metadata: metadata ?? {},
    })
  } catch {
    // Analytics should never break the user flow
  }
}
