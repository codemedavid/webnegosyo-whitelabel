/**
 * Who is asking, for which store, and what they may use — decided BEFORE any
 * streaming starts (a session refresh after the response has begun cannot
 * set its cookies, and a refusal must be a plain HTTP error, not a chat line).
 */

import 'server-only'

import { verifyTenantAdmin } from '@/lib/admin-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { isCustomerHubOn } from '@/lib/customer-dashboard'
import { SubscriptionPausedError } from '@/lib/billing/subscription-gate'
import type { OrderBackendTenantFields } from '@/lib/order-backend'
import { isAssistantGloballyEnabled } from '@/lib/assistant/config'
import type { AssistantCaller, AssistantTenantFlags } from '@/lib/assistant/tools/registry'

export interface AssistantStore {
  id: string
  slug: string
  name: string
}

export type AssistantAccess =
  | { ok: true; caller: AssistantCaller; store: AssistantStore; flags: AssistantTenantFlags }
  | { ok: false; status: 401 | 403 | 404; error: string }

const TENANT_SELECT =
  'id, slug, name, assistant_enabled, inventory_enabled, menu_engineering_enabled, customer_hub_enabled, order_backend, convex_deployment_url'

function refusal(status: 401 | 403 | 404, error: string): AssistantAccess {
  return { ok: false, status, error }
}

export async function resolveAssistantAccess(tenantId: string): Promise<AssistantAccess> {
  if (!isAssistantGloballyEnabled()) return refusal(403, 'The assistant is switched off right now.')

  let verified: Awaited<ReturnType<typeof verifyTenantAdmin>>
  try {
    verified = await verifyTenantAdmin(tenantId, 'view')
  } catch (error) {
    if (error instanceof SubscriptionPausedError) return refusal(403, 'Your subscription is paused, so the assistant is unavailable.')
    const message = error instanceof Error ? error.message : ''
    return message.includes('Not authenticated')
      ? refusal(401, 'Please sign in again.')
      : refusal(403, "You don't have access to this store.")
  }

  const { user, userRole } = verified
  // Store-wide tools would show a branch account other branches' numbers.
  if (resolveBranchScope(userRole).kind === 'branch') {
    return refusal(403, 'The assistant is available to store-wide accounts for now.')
  }

  const { data: tenant, error } = await createAdminClient().from('tenants').select(TENANT_SELECT).eq('id', tenantId).maybeSingle()
  if (error) {
    console.error('[assistant] tenant read failed', { tenantId, message: error.message })
    return refusal(404, 'This store could not be loaded.')
  }
  if (!tenant) return refusal(404, 'This store could not be found.')
  if (tenant.assistant_enabled !== true) return refusal(403, "The assistant isn't enabled for this store yet.")

  return {
    ok: true,
    caller: {
      userId: user.id,
      role: userRole.role,
      is_owner: userRole.is_owner ?? false,
      permissions: userRole.permissions ?? null,
    },
    store: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    flags: {
      inventoryEnabled: tenant.inventory_enabled === true,
      customerHubOn: isCustomerHubOn(tenant as OrderBackendTenantFields & { customer_hub_enabled: boolean | null }),
      menuEngineeringEnabled: tenant.menu_engineering_enabled === true,
    },
  }
}
