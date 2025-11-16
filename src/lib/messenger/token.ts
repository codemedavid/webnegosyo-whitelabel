/**
 * Messenger Token Resolution
 * Gets tenant-specific Facebook Page Access Token with fallback to global token
 */

import { createClient } from '@/lib/supabase/server'

/**
 * Get Facebook Page Access Token for a tenant
 * Returns tenant-specific token if configured, otherwise falls back to global token
 */
export async function getPageTokenForTenant(tenantId: string): Promise<string | null> {
  const supabase = await createClient()

  // Get tenant-specific token
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('messenger_page_access_token')
    .eq('id', tenantId)
    .single()

  if (error) {
    console.error('Error fetching tenant token:', error)
    // Fallback to global token
    return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantToken = (tenant as any)?.messenger_page_access_token

  // Use tenant token if configured, otherwise fallback to global token
  if (tenantToken && tenantToken.trim() !== '') {
    return tenantToken
  }

  // Fallback to global token
  return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null
}

