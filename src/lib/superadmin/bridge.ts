// Contract for the superadmin API bridge (`/api/superadmin/[action]`).
//
// The mobile console talks to Supabase directly for anything reachable under
// the superadmin's own RLS grant. This bridge exists only for the handful of
// operations that require the service-role key or a server-side secret, which
// can never ship inside an app binary:
//
//   - Convex / Supabase per-tenant deploys (deploy keys)
//   - MCP key minting and revocation (hashing, one-time secret return)
//   - Staff create / remove / password reset (Supabase admin API)
//   - AI menu parsing (OpenRouter key)
//
// Pure request-shaping only: token extraction, the action allowlist, and
// payload validation. Authentication, authorization and the actual work happen
// in the route handler, which re-verifies the caller's role server-side.

export interface BridgeAction {
  /** Payload keys that must be present and non-blank. */
  requiredFields: readonly string[]
  /** Human-readable summary, surfaced in the route's error messages. */
  description: string
}

export const SUPERADMIN_BRIDGE_ACTIONS: Record<string, BridgeAction> = {
  'convex-deploy': {
    requiredFields: ['tenantId'],
    description: "Deploy the Convex schema to a tenant's deployment",
  },
  'supabase-deploy': {
    requiredFields: ['tenantId'],
    description: "Deploy the order schema to a tenant's Supabase project",
  },
  'mcp-keys-list': {
    requiredFields: [],
    description: 'List MCP API keys',
  },
  'mcp-key-create': {
    requiredFields: ['label'],
    description: 'Mint a new MCP API key',
  },
  'mcp-key-revoke': {
    requiredFields: ['id'],
    description: 'Revoke an MCP API key',
  },
  'staff-create': {
    requiredFields: ['tenantId', 'email', 'password'],
    description: 'Create a staff account for a tenant',
  },
  'staff-remove': {
    requiredFields: ['tenantId', 'userId'],
    description: 'Remove a staff account from a tenant',
  },
  'staff-reset-password': {
    requiredFields: ['tenantId', 'userId', 'password'],
    description: "Reset a staff account's password",
  },
  'parse-menu': {
    requiredFields: ['text'],
    description: 'Parse raw menu text into structured categories and items',
  },
}

/**
 * Pull the token out of an Authorization header. Returns null rather than
 * throwing so the caller can answer 401 uniformly.
 */
export function extractBearerToken(header: string | null): string | null {
  if (!header) return null

  const trimmed = header.trim()
  const match = /^bearer\s+(\S+)\s*$/i.exec(trimmed)
  return match ? match[1] : null
}

/**
 * Whether the name is a registered action. Uses a own-property check so
 * inherited members ('constructor', '__proto__', 'toString') cannot resolve to
 * a truthy "action" and reach the dispatcher.
 */
export function isBridgeAction(action: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUPERADMIN_BRIDGE_ACTIONS, action)
}

export type BridgeValidation = { ok: true } | { ok: false; error: string }

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  )
}

export function validateBridgePayload(
  action: string,
  payload: unknown
): BridgeValidation {
  if (!isBridgeAction(action)) {
    return { ok: false, error: `Unknown action: ${action}` }
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }

  const body = payload as Record<string, unknown>
  const missing = SUPERADMIN_BRIDGE_ACTIONS[action].requiredFields.filter(
    (field) => isBlank(body[field])
  )

  if (missing.length > 0) {
    return { ok: false, error: `Missing required field(s): ${missing.join(', ')}` }
  }

  return { ok: true }
}
