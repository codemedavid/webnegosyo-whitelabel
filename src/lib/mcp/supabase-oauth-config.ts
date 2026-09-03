/** Canonical Supabase Auth and audience configuration for the superadmin MCP. */
export const SUPERADMIN_MCP_PATH = '/api/mcp/mcp'
export const SUPERADMIN_MCP_CONSENT_PATH = '/superadmin/mcp/authorize'
export const SUPERADMIN_INTERNAL_SCOPE = 'superadmin'

export function getSupabaseOAuthIssuer(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
}

export function getSuperadminMcpResource(origin: string): string {
  return `${origin.trim().replace(/\/+$/, '')}${SUPERADMIN_MCP_PATH}`
}

export function isSuperadminMcpAudience(audience: string | string[], resource: string): boolean {
  return typeof audience === 'string' ? audience === resource : audience.includes(resource)
}
