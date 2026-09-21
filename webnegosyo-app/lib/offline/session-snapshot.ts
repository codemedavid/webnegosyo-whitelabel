/**
 * The last successfully resolved merchant session, kept on the device so the
 * app can open without a connection.
 *
 * Cold start re-reads `app_users`, `tenants` and `outlets` on every launch
 * (app/_layout.tsx `useAuthInit`). With no network that lookup cannot
 * complete, and until now the merchant was parked on a retry screen — the
 * register was unusable exactly when the shop's Wi-Fi was down. The stored
 * GoTrue session was always kept; what was missing was the resolved tenant
 * (which database, which receipt layout, which branch).
 *
 * Rules:
 * - Written on every successful resolution (cold start and interactive
 *   sign-in), so it is never older than the last time the app was online.
 * - Merchant sessions only. A superadmin's surface is the platform admin,
 *   which needs the server anyway; nothing is gained by restoring it.
 * - Restored ONLY when the lookup is unreachable — a genuine "no rows" answer
 *   still signs out, because that is the server saying this account is gone.
 * - Cleared on sign-out (see `bindSessionSnapshotToAuth`).
 *
 * Storage note: tenant configuration and a user id — no token, no secret, no
 * customer data. The GoTrue session itself already lives in AsyncStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SessionAuthPatch } from "../session-resolve";

export const SESSION_SNAPSHOT_KEY = "offline_session_v1";

export interface SessionSnapshot {
  version: 1;
  savedAt: number;
  auth: SessionAuthPatch;
}

function isSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SessionSnapshot>;
  return (
    candidate.version === 1 &&
    typeof candidate.savedAt === "number" &&
    !!candidate.auth &&
    typeof candidate.auth === "object" &&
    typeof candidate.auth.userId === "string" &&
    typeof candidate.auth.tenantId === "string"
  );
}

/** Save a merchant session; a superadmin (no tenant) is deliberately skipped. */
export async function saveSessionSnapshot(
  auth: SessionAuthPatch,
  now: number = Date.now()
): Promise<void> {
  if (auth.isSuperadmin || !auth.tenantId) return;
  const snapshot: SessionSnapshot = { version: 1, savedAt: now, auth };
  try {
    await AsyncStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("[offline] Could not save the session snapshot:", error);
  }
}

/**
 * The stored session for `userId`, or null. The id check means a device that
 * changed hands (sign out, sign in as someone else while online, then lose the
 * network) never restores the previous person's store.
 */
export async function loadSessionSnapshot(userId: string | null): Promise<SessionAuthPatch | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_SNAPSHOT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) return null;
    if (userId !== null && parsed.auth.userId !== userId) return null;
    return parsed.auth;
  } catch {
    return null;
  }
}

export async function clearSessionSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_SNAPSHOT_KEY);
  } catch (error) {
    console.warn("[offline] Could not clear the session snapshot:", error);
  }
}

/** The slice of GoTrue's `onAuthStateChange` this module needs. */
export interface AuthEventsLike {
  onAuthStateChange: (callback: (event: string) => void) => unknown;
}

/**
 * Drop the snapshot the moment the account signs out, wherever that happens
 * (four screens call `signOut`). Bound once per process.
 */
export function bindSessionSnapshotToAuth(auth: AuthEventsLike): void {
  auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") void clearSessionSnapshot();
  });
}

/**
 * The GoTrue read failed because the server could not be reached (an expired
 * access token that could not be refreshed offline), as opposed to "no session
 * stored". supabase-js reports both as `session: null`; only the former should
 * try the snapshot.
 */
export function isRetryableSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AuthRetryableFetchError";
}
