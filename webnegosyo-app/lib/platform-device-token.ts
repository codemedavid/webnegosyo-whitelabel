// Where this phone files its token for PLATFORM messages — "What's New" posts
// and on-command notices from the platform operator.
//
// Order-push registration (lib/push-registration.ts) depends on the store's
// order backend: a Convex store files tokens in its own deployment, a
// platform-backend store in `public.push_tokens`, and the per-tenant track
// nowhere. Platform messages have no such split. Every signed-in merchant
// device files ONE row in `public.platform_device_tokens`, so a broadcast
// reads one table and never fans out per tenant. Same two exclusions as
// order pushes: the demo (a quiet showroom) and a superadmin viewing someone
// else's store (a spectator, registered under their own account elsewhere).

export interface PlatformDeviceState {
  isAuthenticated: boolean;
  userId: string | null;
  /** The account's own store; null for a platform superadmin. */
  tenantId: string | null;
  isDemo: boolean;
  isSuperadmin: boolean;
  impersonatedTenantId: string | null;
  /**
   * Accepted so callers can hand over the same session slice they give
   * order-push registration; deliberately unread — the order backend does
   * not decide whether a device hears platform news.
   */
  orderBackend?: string | null;
  convexUrl?: string | null;
}

export interface PlatformDeviceRegistration {
  userId: string;
  tenantId: string | null;
}

/** The row this session should upsert, or null when it must not register. */
export function platformDeviceRegistration(
  state: PlatformDeviceState
): PlatformDeviceRegistration | null {
  if (!state.isAuthenticated || !state.userId) return null;
  if (state.isDemo) return null;
  if (state.isSuperadmin && state.impersonatedTenantId !== null) return null;
  return { userId: state.userId, tenantId: state.tenantId };
}

export interface PlatformDeviceTokenInput {
  token: string;
  userId: string;
  tenantId: string | null;
  /** Android channels this install created (e.g. ["approvals"]). */
  channels: readonly string[];
}

export interface PlatformDeviceTokenRow {
  token: string;
  user_id: string;
  tenant_id: string | null;
  platform: "ios" | "android";
  last_seen_at: string;
  channels?: string[];
}

/**
 * The `platform_device_tokens` row for this device. `channels` tells the
 * server which Android channels exist here: a push aimed at a channel the
 * phone never created is dropped without a trace (design-spec §0.2), so the
 * server only targets `approvals` on installs that reported it.
 * `includeChannels: false` is for a database the column has not reached yet.
 */
export function platformDeviceTokenRow(
  input: PlatformDeviceTokenInput,
  platform: "ios" | "android",
  nowIso: string,
  includeChannels: boolean
): PlatformDeviceTokenRow {
  const row: PlatformDeviceTokenRow = {
    token: input.token,
    user_id: input.userId,
    tenant_id: input.tenantId,
    platform,
    last_seen_at: nowIso,
  };
  return includeChannels ? { ...row, channels: [...input.channels] } : row;
}

/** PostgREST's "column not in the schema cache" or Postgres' undefined column, naming `column`. */
export function isMissingColumnError(
  error: { code?: string | null; message?: string | null } | null,
  column: string
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code !== "PGRST204" && code !== "42703") return false;
  return (error.message ?? "").includes(column);
}
