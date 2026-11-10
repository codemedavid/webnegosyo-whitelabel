/**
 * Keeping a Convex client authenticated for as long as the device is signed in.
 *
 * Convex calls the token fetcher, and asks for a NEW token when the server
 * rejected the last one. If a fetch answers null it reports failure and never
 * asks again, so one token read that timed out behind a stalled refresh used to
 * leave the client unauthenticated until it was recreated. Harmless while every
 * store admits anyone; on an enforced store it would refuse every sale.
 *
 * Free of native imports so it can be tested without a device.
 */

export type ConvexTokenFetcher = (args: { forceRefreshToken: boolean }) => Promise<string | null>;

export interface ConvexTokenSource {
  /** The session's current token (`getAccessTokenBounded`). */
  read: () => Promise<string | null>;
  /** A newly issued one (`refreshAccessTokenBounded`). */
  refresh: () => Promise<string | null>;
}

export function convexTokenFetcher(source: ConvexTokenSource): ConvexTokenFetcher {
  return async ({ forceRefreshToken }) => {
    if (forceRefreshToken) {
      // A failed refresh is usually no signal, and answering null would drop
      // the client's auth over a connection blip. Offer what the session holds.
      const fresh = await source.refresh();
      if (fresh) return fresh;
    }
    return source.read();
  };
}

export const CONVEX_AUTH_RETRY_BASE_MS = 15_000;
export const CONVEX_AUTH_RETRY_MAX_MS = 5 * 60_000;

export interface ConvexAuthClient {
  setAuth: (fetchToken: ConvexTokenFetcher, onChange?: (isAuthenticated: boolean) => void) => void;
}

export interface ArmConvexAuthDeps {
  fetchToken: ConvexTokenFetcher;
  /** A real account on this device. The demo store has no token, by design. */
  isSignedIn: () => boolean;
}

/** Give the client its token, and again whenever it gives up. Returns the off switch. */
export function armConvexAuth(client: ConvexAuthClient, deps: ArmConvexAuthDeps): () => void {
  let isDisarmed = false;
  let delayMs = CONVEX_AUTH_RETRY_BASE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onChange = (isAuthenticated: boolean): void => {
    clearTimeout(timer);
    if (isDisarmed) return;
    if (isAuthenticated) {
      delayMs = CONVEX_AUTH_RETRY_BASE_MS;
      return;
    }
    if (!deps.isSignedIn()) return;
    timer = setTimeout(() => {
      if (!isDisarmed) client.setAuth(deps.fetchToken, onChange);
    }, delayMs);
    delayMs = Math.min(delayMs * 2, CONVEX_AUTH_RETRY_MAX_MS);
  };

  client.setAuth(deps.fetchToken, onChange);
  return () => {
    isDisarmed = true;
    clearTimeout(timer);
  };
}
