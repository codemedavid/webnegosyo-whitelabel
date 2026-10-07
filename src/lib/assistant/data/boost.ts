/**
 * The Boost Sales workspace as the assistant reads it, after the route has
 * authorised the caller for this tenant. Shared by every offer tool so one
 * turn that lists offers and then proposes a change reads it once.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getBoostWorkspace, type BoostTenantFields, type BoostWorkspace } from '@/lib/boost/workspace'
import type { AssistantToolContext } from '@/lib/assistant/tools/registry'

export const BOOST_TENANT_SELECT =
  'id, order_backend, convex_deployment_url, menu_engineering_enabled, checkout_upsell_enabled, checkout_upsell_title, checkout_upsell_subtitle, checkout_upsell_max_items'

/** Null when the store's settings cannot be read. */
export function readBoostWorkspace(ctx: Pick<AssistantToolContext, 'tenantId' | 'memo'>): Promise<BoostWorkspace | null> {
  return ctx.memo('boost-workspace', async () => {
    const { data, error } = await createAdminClient().from('tenants').select(BOOST_TENANT_SELECT).eq('id', ctx.tenantId).single()
    if (error || !data) return null
    return getBoostWorkspace(data as unknown as BoostTenantFields)
  })
}
