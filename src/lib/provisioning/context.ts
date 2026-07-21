import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Provisioning context for the SmartMenu MCP admin surface.
 *
 * Domain writers (categories, menu items, bundles, …) normally acquire a
 * cookie-based Supabase client and run their own `verifyTenantAdmin` check.
 * That path is impossible for MCP requests, which arrive from a separate
 * process (Claude/ChatGPT) with a Bearer API key and no session cookie.
 *
 * When a writer is handed a `ProvisioningCtx`, it uses the supplied
 * service-role client and SKIPS its cookie-based authorization — authorization
 * has already happened upstream via `verifyMcpKey` (see src/lib/mcp-auth.ts).
 * Passing a context therefore asserts "the caller is an authorized superadmin".
 */
export interface ProvisioningCtx {
  /** Service-role Supabase client (bypasses RLS). */
  client: SupabaseClient<Database>
}

/**
 * Resolves the Supabase client a writer should use: the injected service-role
 * client when running under MCP, otherwise the caller-provided cookie client.
 */
export function resolveWriteClient(
  ctx: ProvisioningCtx | undefined,
  cookieClient: SupabaseClient<Database>,
): SupabaseClient<Database> {
  return ctx?.client ?? cookieClient
}
