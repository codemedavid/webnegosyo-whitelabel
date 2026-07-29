/**
 * Safe navigation inside the merchant tab navigator (app/(main)).
 *
 * Why this module exists: `router.replace()` to a route that lives inside the
 * SAME tab navigator crashes the app with
 * "Cannot read property 'stale' of undefined", taking the whole (main) tree
 * down to its ErrorBoundary. The chain is:
 *
 *   1. `router.replace(href)` dispatches a REPLACE action.
 *   2. expo-router's `tabRouterOverride` handles REPLACE by rewriting the
 *      navigator's own state key to `${key}-replace`.
 *   3. A changed state key remounts the navigator, so `currentState` is
 *      undefined on the next render while the nested params are already marked
 *      consumed — which skips the initialization guard in
 *      @react-navigation/core's useNavigationBuilder.
 *   4. It then calls `router.getRehydratedState(undefined, …)`, and TabRouter
 *      reads `state.stale` on undefined and throws.
 *
 * `router.navigate()` expresses the same intent — go there, don't stack another
 * screen on top — via a NAVIGATE action, which leaves the navigator's key (and
 * therefore the mounted navigator) alone.
 *
 * Crossing OUT of the tab navigator (to `(auth)` or `(superadmin)`) is a
 * different story: that action targets the root stack, where replace is both
 * correct and safe, and dropping the screen behind you is the point.
 *
 * Pure by design so it is unit-testable under the node-environment Jest config;
 * the caller passes its own router in.
 */

/** Route prefix owned by the merchant tab navigator. */
const TAB_GROUP_PREFIX = "/(main)/";

export type NavigationVerb = "navigate" | "replace";

/**
 * The subset of expo-router's `router` this module drives.
 *
 * Generic over the href type so it accepts the real `router`, whose methods are
 * typed against expo-router's generated `Href` union rather than plain `string`.
 * Callers infer `H` from the href they pass, which keeps typed-routes checking
 * at the call site instead of widening it away here.
 */
export interface TabAwareRouter<H extends string = string> {
  navigate: (href: H) => void;
  replace: (href: H) => void;
}

/** True when `href` addresses a route inside the merchant tab navigator. */
export function isTabNavigatorHref(href: string): boolean {
  return href.startsWith(TAB_GROUP_PREFIX);
}

/**
 * The navigation verb that reaches `href` without remounting the navigator.
 * See the module comment for why replace is unsafe within the tab tree.
 */
export function navigationVerbFor(href: string): NavigationVerb {
  return isTabNavigatorHref(href) ? "navigate" : "replace";
}

/**
 * Go to `href` using the verb that is safe for it.
 *
 * Use this anywhere a screen would otherwise reach for `router.replace()` —
 * it keeps "replace" semantics when leaving the tab tree and downgrades to
 * "navigate" when staying inside it.
 */
export function goTo<H extends string>(router: TabAwareRouter<H>, href: H): void {
  if (navigationVerbFor(href) === "navigate") {
    router.navigate(href);
    return;
  }
  router.replace(href);
}
