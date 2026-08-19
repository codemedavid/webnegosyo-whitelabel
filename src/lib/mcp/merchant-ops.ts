import type { z } from 'zod'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { listOps, executeOp, type ProvisioningOp } from '@/lib/mcp/provisioning-ops'

/**
 * Merchant-side MCP ops registry — the provisioning registry, tenant-pinned.
 *
 * A merchant credential is bound to exactly one tenant (see mcp-auth.ts). This
 * module is the security boundary that makes the binding matter:
 *
 * - superadmin-only ops are excluded outright,
 * - `tenantId` is stripped from every advertised input schema, so the model
 *   never sees the field, and
 * - the token-bound tenant is INJECTED into the payload at execute time,
 *   overwriting anything a caller smuggles in. Authorization is by
 *   construction, not by validating caller-supplied tenant ids.
 */

/** Ops a tenant-scoped credential must never reach. */
export const MERCHANT_EXCLUDED_OPS: ReadonlySet<string> = new Set([
  // Tenant lifecycle and cross-tenant reads are platform-operator authority.
  'create_tenant',
  'list_tenants',
  'get_tenant',
  // Integration credentials (Messenger tokens, Convex URLs) are superadmin-only.
  'configure_integration',
  // SMS campaigns send real messages; keep them operator-gated for now.
  'create_sms_campaign',
  'list_sms_campaigns',
])

interface ZodObjectLike {
  shape?: Record<string, unknown>
  omit?: (mask: Record<string, true>) => z.ZodType<unknown>
}

/**
 * Returns the op's input schema without the `tenantId` field. Schemas that do
 * not advertise `tenantId` (or are not plain ZodObjects) pass through as-is.
 */
function withoutTenantIdSchema(input: z.ZodType<unknown>): z.ZodType<unknown> {
  const objectLike = input as unknown as ZodObjectLike
  if (!objectLike.shape || !('tenantId' in objectLike.shape) || typeof objectLike.omit !== 'function') {
    return input
  }
  return objectLike.omit({ tenantId: true })
}

/**
 * The merchant-visible ops: the provisioning registry minus exclusions, with
 * `tenantId` removed from every advertised schema. Built once at module load —
 * the underlying registry is static.
 */
const merchantOps: ProvisioningOp<unknown>[] = listOps()
  .filter((op) => !MERCHANT_EXCLUDED_OPS.has(op.name))
  .map((op) => ({ ...op, input: withoutTenantIdSchema(op.input) }))

export function listMerchantOps(): ProvisioningOp<unknown>[] {
  return merchantOps
}

const merchantOpNames = new Set(merchantOps.map((op) => op.name))

export interface ExecuteMerchantOpDeps {
  /** Injectable dispatch for tests; defaults to the real executeOp. */
  execute?: typeof executeOp
}

/**
 * Executes a merchant tool call with the credential-bound tenant injected into
 * the payload. The pinned tenantId ALWAYS wins over anything in `rawInput`.
 * Refuses excluded and unknown ops before touching the registry.
 */
export async function executeMerchantOp(
  name: string,
  ctx: ProvisioningCtx,
  pinnedTenantId: string,
  rawInput: unknown,
  deps: ExecuteMerchantOpDeps = {},
): Promise<unknown> {
  if (MERCHANT_EXCLUDED_OPS.has(name)) {
    throw new Error(`Tool not available on the merchant surface: ${name}`)
  }
  if (!merchantOpNames.has(name)) {
    throw new Error(`Unknown op: ${name}`)
  }

  const input =
    rawInput && typeof rawInput === 'object'
      ? { ...(rawInput as Record<string, unknown>), tenantId: pinnedTenantId }
      : { tenantId: pinnedTenantId }

  const execute = deps.execute ?? executeOp
  return execute(name, ctx, input)
}
