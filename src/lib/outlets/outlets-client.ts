import { createClient } from '@/lib/supabase/client'
import { OUTLET_SELECT } from '@/lib/outlets/outlet-repository'
import type { Outlet } from '@/types/database'

/**
 * The storefront's own read of a tenant's active branches.
 *
 * The menu page gets its branches server-side; checkout is a client route with
 * no such handoff, so it reads them here through the anon browser client — the
 * same public read the menu performs. Only ever called for a tenant that asks
 * for the branch at checkout, so no other storefront pays for it.
 *
 * A failure returns an empty list rather than throwing: the caller treats "no
 * branches" as "nothing to ask", which degrades to today's checkout instead of
 * stranding the customer on a broken page.
 */
export async function fetchActiveOutlets(tenantId: string): Promise<Outlet[]> {
  const { data, error } = await createClient()
    .from('outlets')
    .select(OUTLET_SELECT)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.warn('[outlets-client] Failed to load branches:', error.message)
    return []
  }

  return (data ?? []) as unknown as Outlet[]
}
