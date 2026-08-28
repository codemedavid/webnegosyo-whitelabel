/**
 * Telling Supabase when it may refresh the session token.
 *
 * `autoRefreshToken` runs on a timer inside GoTrueClient. Left to itself the
 * timer keeps ticking after the OS has suspended the app's network, so a
 * refresh fires, its request never gets a response, and the call never
 * completes. GoTrue holds its storage lock for the duration and chains every
 * later `getSession()` behind it — so from that moment on, every authenticated
 * call in the app waits forever, and force-quitting is the only cure. That is
 * the register freeze cashiers were clearing by hand: swipe to complete, footer
 * spinner, kill the app.
 *
 * The rule is Supabase's own React Native guidance — stop the timer while the
 * app is away, start it again when it comes back. It lives here, apart from
 * `supabase.ts`, so it can be tested without constructing a real client.
 */

export type AppStateValue = string;

/** Whether the refresh timer should be running in this app state. */
export type AutoRefreshAction = "start" | "stop";

/**
 * Refresh only while the app is genuinely in front of the user.
 *
 * "inactive" counts as away: it covers the app switcher and an incoming call,
 * where the network is already unreliable and a refresh started now is one that
 * may never come back.
 */
export function autoRefreshActionFor(state: AppStateValue): AutoRefreshAction {
  return state === "active" ? "start" : "stop";
}

/** The part of Supabase's auth client this module drives. */
export interface AutoRefreshableAuth {
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
}

/** The part of React Native's AppState this module listens to. */
export interface AppStateLike {
  addEventListener: (
    event: "change",
    handler: (state: AppStateValue) => void,
  ) => unknown;
}

/**
 * Keep the refresh timer in step with the app's foreground state.
 *
 * Applies the current state immediately so an app launched in the foreground
 * starts refreshing without waiting for its first transition.
 */
export function bindAutoRefreshToAppState(
  appState: AppStateLike,
  auth: AutoRefreshableAuth | null,
  currentState: AppStateValue,
): void {
  if (!auth) return;

  const apply = (state: AppStateValue) => {
    if (autoRefreshActionFor(state) === "start") auth.startAutoRefresh();
    else auth.stopAutoRefresh();
  };

  apply(currentState);
  appState.addEventListener("change", apply);
}
