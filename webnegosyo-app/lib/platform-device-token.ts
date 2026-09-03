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
