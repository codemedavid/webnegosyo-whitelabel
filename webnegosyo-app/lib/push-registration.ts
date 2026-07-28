// Who receives a store's order push notifications.
//
// Registration writes the device token into the *viewed tenant's* Convex
// `pushTokens` table, and `notifications:sendOrderNotification` pushes to every
// token it finds there. A superadmin opening a merchant view swaps `convexUrl`
// to that tenant's deployment (see ./impersonation), so registering while
// impersonating subscribed the platform operator to that store's orders — and
// exiting never removed the token. One superadmin ended up registered in three
// separate stores, so every order in any of them rang their phone.
//
// Order alerts belong to the people who work the store. Pure predicates here so
// the rule is testable without a device, a store, or a Convex deployment.

/** The slice of auth state that decides push registration. */
export interface PushRegistrationState {
  isAuthenticated: boolean;
  userId: string | null;
  /** The Convex deployment currently being viewed; null on the platform surface. */
  convexUrl: string | null;
  isSuperadmin: boolean;
  /** Set while a superadmin is viewing someone else's store. */
  impersonatedTenantId: string | null;
}

/** A deployment to unregister this device from, or null when there is nothing to do. */
export interface PushTokenCleanup {
  convexUrl: string;
  userId: string;
}

function isImpersonating(state: PushRegistrationState): boolean {
  return state.isSuperadmin && state.impersonatedTenantId !== null;
}

/**
 * Whether this session should receive the viewed store's order notifications.
 *
 * True only for someone signed in to a store as their own: a merchant admin, or
 * a superadmin whose session actually is that tenant. A superadmin borrowing a
 * merchant view is a spectator and never subscribes.
 */
export function shouldRegisterPushToken(state: PushRegistrationState): boolean {
  if (!state.isAuthenticated) return false;
  if (!state.userId || !state.convexUrl) return false;
  return !isImpersonating(state);
}

/**
 * The registration to tear down when opening a store as a superadmin.
 *
 * Self-healing for devices that leaked a token before this rule existed: the
 * next time the superadmin opens that store, the stale token is removed from
 * that deployment instead of quietly ringing forever.
 */
export function pushTokenCleanup(
  state: PushRegistrationState
): PushTokenCleanup | null {
  if (!isImpersonating(state)) return null;
  if (!state.userId || !state.convexUrl) return null;
  return { convexUrl: state.convexUrl, userId: state.userId };
}
