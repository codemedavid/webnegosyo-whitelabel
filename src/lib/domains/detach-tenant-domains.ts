import { createVercelDomainsClient, readVercelDomainsConfig, type VercelDomainsClient } from '@/lib/domains/vercel-domains'

/** The domain columns a deleted tenant may have held. */
export interface TenantDomainColumns {
  domain?: string | null
  pending_domain?: string | null
}

/**
 * Best-effort: detach a DELETED tenant's domains (and their www aliases) from
 * the Vercel project so orphans do not pile up there. Not a security boundary
 * — another store still has to prove ownership by TXT before a domain routes —
 * so a failure is logged, never thrown into the delete flow.
 */
export async function detachTenantDomains(
  row: TenantDomainColumns | null | undefined,
  client: VercelDomainsClient | null = defaultClient(),
): Promise<void> {
  const names = [...new Set([row?.domain, row?.pending_domain].filter((name): name is string => Boolean(name)))]
  if (!client || names.length === 0) return

  const results = await Promise.all(
    names.flatMap((name) => [client.removeDomain(`www.${name}`), client.removeDomain(name)]),
  )
  const failures = results.filter((result) => !result.ok)
  if (failures.length > 0) {
    console.error('[custom-domain] could not detach a deleted store\'s domain from Vercel', { names, failures })
  }
}

function defaultClient(): VercelDomainsClient | null {
  const config = readVercelDomainsConfig()
  return config ? createVercelDomainsClient(config) : null
}
