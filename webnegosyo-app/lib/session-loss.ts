/**
 * What the app does when the SERVER ends this device's session.
 *
 * GoTrue can lose a session without anyone tapping "Sign out": a staff
 * password reset or a global sign-out elsewhere revokes every refresh token,
 * and the next refresh comes back 400. supabase-js then drops the stored
 * session and emits SIGNED_OUT — and from that moment every query goes out as
 * the anonymous role.
 *
 * The auth store, though, is filled once at launch (`useAuthInit`). Nothing
 * told it, so the order screens kept running: RLS answered every read with
 * zero rows and no error, and refused every counter sale. A branch watched an
 * empty queue for over an hour while orders arrived (Gungjeon Central,
 * 2026-10-04). Here the store follows GoTrue, so the existing redirect puts
 * the device on the sign-in screen and staff are told why.
 *
 * A network failure never reaches here: supabase-js keeps the session on a
 * retryable error, so the offline register is unaffected.
 */

import { isDeliberateSignOut } from "./sign-out";

export interface SessionLossDeps {
  onAuthStateChange: (callback: (event: string) => void) => unknown;
  /** The store says a real (non-demo) account is signed in on this device. */
  isSignedInHere: () => boolean;
  /** Clear the auth store; the root layout's redirect does the rest. */
  signOutLocally: () => void;
  tellStaff: () => void;
  /** A fresh sign-in on this device. */
  onSignedIn: () => void;
}

export const SESSION_LOST_TITLE = "Signed out";
export const SESSION_LOST_MESSAGE =
  "This device was signed out (for example, the account's password was changed). " +
  "Sign in again to keep receiving orders. Unsent sales are kept and will send after you sign in.";

/** Bind once per process. */
export function bindSessionLossToAuth(deps: SessionLossDeps): void {
  deps.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") {
      deps.onSignedIn();
      return;
    }
    if (event !== "SIGNED_OUT") return;
    if (isDeliberateSignOut() || !deps.isSignedInHere()) return;
    deps.signOutLocally();
    deps.tellStaff();
  });
}
