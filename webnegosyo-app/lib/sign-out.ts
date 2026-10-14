import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sign-out scope for every sign-out path in the merchant app.
 *
 * Supabase's default (`global`) revokes EVERY session the user has — every
 * colleague's phone and browser, and the MCP connector's OAuth session. With a
 * shared account that meant one cashier signing out kicked the whole team.
 *
 * `local` ends only the session on this device (the server still revokes that
 * one refresh token, so it is not weaker — just narrower).
 */
export const SIGN_OUT_SCOPE = "local" as const;

type SignOutCapable = { auth: Pick<SupabaseClient["auth"], "signOut"> };

/**
 * Sign-outs in progress on this device. GoTrue emits SIGNED_OUT from inside
 * `signOut()`, before the calling screen clears the store, so
 * `lib/session-loss.ts` asks this to tell a tap from a revoked session.
 */
let deliberateSignOuts = 0;

export function isDeliberateSignOut(): boolean {
  return deliberateSignOuts > 0;
}

/** The device cleanup may not hold a sign-out hostage (a dead network). */
export const BEFORE_SIGN_OUT_TIMEOUT_MS = 3000;

let beforeSignOut: (() => Promise<void>) | null = null;

/**
 * Work that must run while the session still exists — e.g. deleting this
 * device's platform push token, which the row's own-user RLS allows only to
 * its owner (approvals security review L1). Registered once by the root
 * layout; `null` clears it.
 */
export function setBeforeSignOut(cleanup: (() => Promise<void>) | null): void {
  beforeSignOut = cleanup;
}

async function runBeforeSignOut(): Promise<void> {
  if (!beforeSignOut) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, BEFORE_SIGN_OUT_TIMEOUT_MS);
  });
  try {
    await Promise.race([beforeSignOut().catch(() => undefined), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Ends this device's session and nothing else. Use instead of `auth.signOut()`. */
export async function signOutThisDevice(supabase: SignOutCapable) {
  deliberateSignOuts += 1;
  try {
    await runBeforeSignOut();
    return await supabase.auth.signOut({ scope: SIGN_OUT_SCOPE });
  } finally {
    deliberateSignOuts -= 1;
  }
}
