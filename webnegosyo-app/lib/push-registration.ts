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

import { hasLiveOrderBackend, type OrderBackend } from "./order-backend";

/** The slice of auth state that decides push registration. */
export interface PushRegistrationState {
  isAuthenticated: boolean;
  userId: string | null;
  /** The Convex deployment currently being viewed; null on the platform surface. */
  convexUrl: string | null;
  /**
   * The viewed tenant's order backend. Optional so older callers (and the
   * Convex-era tests) keep their meaning: absent reads as the historical
   * "Convex when there is a url" rule.
   */
  orderBackend?: OrderBackend | null;
  /** The tenant in view; where a platform token is filed. */
  tenantId?: string | null;
  isSuperadmin: boolean;
  /** Set while a superadmin is viewing someone else's store. */
  impersonatedTenantId: string | null;
  /**
   * The branch this *account* is confined to; null for an owner.
   *
   * Deliberately the account scope, not the branch an owner is currently
   * viewing — see `pushRegistrationOutletId`.
   */
  outletId?: string | null;
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
  if (!state.userId) return false;
  if (isImpersonating(state)) return false;
  // Same availability rule the screens use: a Convex url, or the shared
  // platform backend. The per-tenant-Supabase track has no send path, so
  // registering there would promise alerts nothing will ever deliver.
  return hasLiveOrderBackend({
    convexUrl: state.convexUrl,
    orderBackend: state.orderBackend ?? null,
  });
}

/** Where a platform-backend device registers, or null when it must not. */
export interface PlatformPushRegistration {
  tenantId: string;
  userId: string;
  /** The branch this device is bound to; null rings store-wide. */
  outletId: string | null;
}

/**
 * The `public.push_tokens` row this session should write, or null when this
 * session registers elsewhere (Convex) or not at all (impersonation, no
 * tenant). The database trigger on `orders` fans new-order pushes out to
 * whatever is registered here.
 */
export function platformPushRegistration(
  state: PushRegistrationState
): PlatformPushRegistration | null {
  if (!shouldRegisterPushToken(state)) return null;
  if (state.orderBackend !== "platform") return null;
  if (!state.tenantId || !state.userId) return null;
  return {
    tenantId: state.tenantId,
    userId: state.userId,
    outletId: pushRegistrationOutletId(state) ?? null,
  };
}

/** Platform-side rows to delete when a superadmin opens a store, or null. */
export interface PlatformPushCleanup {
  tenantId: string;
  userId: string;
}

/**
 * The platform twin of `pushTokenCleanup`: a superadmin entering a
 * platform-backend store never subscribes, and any token an earlier build
 * leaked into that tenant's rows is removed on entry instead of quietly
 * ringing forever.
 */
export function platformPushCleanup(
  state: PushRegistrationState
): PlatformPushCleanup | null {
  if (!isImpersonating(state)) return null;
  if (!state.userId) return null;
  if (state.orderBackend !== "platform") return null;
  if (!state.impersonatedTenantId) return null;
  return { tenantId: state.impersonatedTenantId, userId: state.userId };
}

/**
 * The branch to register this device under, or undefined for store-wide.
 *
 * The backend rings only the devices bound to an order's branch, so this decides
 * what the phone hears. Two things make the *account* scope the right source:
 *
 * - A token outlives the screen that wrote it. Registering under the branch an
 *   owner happened to be viewing would leave them deaf to every other branch
 *   after they backed out of it — a silent failure they could not diagnose.
 * - It is the same boundary `session-resolve` derives the session from, so a
 *   manager's alerts and a manager's order list can never disagree.
 *
 * Undefined rather than null: it is sent as a Convex mutation argument, and an
 * absent optional is the encoding for "no branch".
 */
export function pushRegistrationOutletId(
  state: PushRegistrationState
): string | undefined {
  const trimmed = typeof state.outletId === "string" ? state.outletId.trim() : "";
  return trimmed === "" ? undefined : trimmed;
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
