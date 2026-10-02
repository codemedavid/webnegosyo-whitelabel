'use server'

import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyTenantOwner } from '@/lib/admin-service'
import { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } from '@/lib/supabase/admin'
import { invalidateTenantCache } from '@/lib/cache'
import { clearDomainCache } from '@/lib/tenant'
import { getRootDomain } from '@/lib/tenant-host'
import { createVercelDomainsClient, readVercelDomainsConfig } from '@/lib/domains/vercel-domains'
import { createDohTxtLookup } from '@/lib/domains/txt-lookup'
import { createSupabaseDomainStore } from '@/lib/domains/supabase-domain-store'
import { createCustomDomainService, type CustomDomainResult } from '@/lib/domains/custom-domain-service'

/**
 * Custom-domain actions for the store owner and for superadmins (both pass
 * `verifyTenantOwner`). Staff accounts never reach the service.
 *
 * Deliberately no `revalidatePath`: a revalidate inside a Server Action
 * re-renders the page the caller is on, and the card polls `check` while DNS
 * propagates. The card renders from the returned view instead.
 */

const NOT_CONFIGURED = 'Custom domains are not set up on this platform yet. Please contact support.'
const MAX_DOMAIN_INPUT_LENGTH = 300
const TOKEN_BYTES = 16

type Operation = 'connect' | 'check' | 'disconnect'

async function runDomainOperation(tenantId: string, operation: Operation, input = ''): Promise<CustomDomainResult> {
  try {
    await verifyTenantOwner(tenantId)

    const vercelConfig = readVercelDomainsConfig()
    if (!vercelConfig) return { ok: false, error: NOT_CONFIGURED }

    const admin = createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }) as unknown as SupabaseClient
    const service = createCustomDomainService({
      store: createSupabaseDomainStore(admin),
      vercel: createVercelDomainsClient(vercelConfig),
      lookupTxt: createDohTxtLookup(),
      now: Date.now,
      createToken: () => randomBytes(TOKEN_BYTES).toString('hex'),
      rootDomain: getRootDomain(),
    })

    const result =
      operation === 'connect'
        ? await service.connect(tenantId, input)
        : operation === 'check'
          ? await service.check(tenantId)
          : await service.disconnect(tenantId)

    if (result.ok && result.isRoutingChanged) await afterRoutingChange(admin, tenantId)
    return result
  } catch (error) {
    console.error('[custom-domain] action failed:', { tenantId, operation, error: error instanceof Error ? error.message : error })
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

/**
 * `tenants.domain` changed: drop every copy that routes or renders from it.
 * The slug is read here, never taken from the client, so a caller cannot aim
 * the purge at another store.
 */
async function afterRoutingChange(admin: SupabaseClient, tenantId: string): Promise<void> {
  clearDomainCache()
  const { data } = await admin.from('tenants').select('slug').eq('id', tenantId).maybeSingle()
  const slug = (data as { slug?: string } | null)?.slug
  if (slug) await invalidateTenantCache(slug, tenantId)
}

export async function checkCustomDomainAction(tenantId: string): Promise<CustomDomainResult> {
  return runDomainOperation(tenantId, 'check')
}

export async function connectCustomDomainAction(tenantId: string, domain: string): Promise<CustomDomainResult> {
  if (typeof domain !== 'string' || domain.length > MAX_DOMAIN_INPUT_LENGTH) {
    return { ok: false, error: 'Enter a domain like order.yourstore.com or yourstore.com' }
  }
  return runDomainOperation(tenantId, 'connect', domain)
}

export async function disconnectCustomDomainAction(tenantId: string): Promise<CustomDomainResult> {
  return runDomainOperation(tenantId, 'disconnect')
}
