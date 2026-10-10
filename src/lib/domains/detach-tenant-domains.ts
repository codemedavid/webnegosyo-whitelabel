import { createVercelDomainsClient, readVercelDomainsConfig, type VercelDomainsClient } from '@/lib/domains/vercel-domains'

/** The domain columns a deleted tenant may have held. */
export interface TenantDomainColumns {
  domain?: string | null
  pending_domain?: string | null
  /** Names the store's custom-domain flow created on the project. */
  domain_vercel_names?: string[] | null
}

/**
 * Best-effort: detach the names a DELETED tenant created on the shared Vercel
 * project so orphans do not pile up there. Only `domain_vercel_names` — a
 * domain the store merely adopted (already on the project) is left alone, or
 * deleting a store could take another site offline. Not a security boundary
 * for routing — another store still has to prove ownership by TXT before a
 * domain routes — so a failure is logged, never thrown into the delete flow.
 */
export async function detachTenantDomains(
  row: TenantDomainColumns | null | undefined,
  client: VercelDomainsClient | null = defaultClient(),
): Promise<void> {
  const names = [...new Set((row?.domain_vercel_names ?? []).filter(Boolean))]
  if (!client || names.length === 0) return

  const results = await Promise.all(names.map((name) => client.removeDomain(name)))
  const failures = results.filter((result) => !result.ok)
  if (failures.length > 0) {
    console.error('[custom-domain] could not detach a deleted store\'s domain from Vercel', { names, failures })
  }
}

function defaultClient(): VercelDomainsClient | null {
  const config = readVercelDomainsConfig()
  return config ? createVercelDomainsClient(config) : null
}
