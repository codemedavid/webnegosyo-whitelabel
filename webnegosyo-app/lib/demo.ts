/**
 * Public demo store configuration.
 *
 * "Explore Demo" on the login screen drops anyone — no account required —
 * straight onto a fully-populated, working store dashboard. This proves the
 * app is publicly usable (not a private/enterprise tool) and lets App Store
 * reviewers reach every screen past the login wall.
 *
 * The demo points at WebNegosyo's own sample store. Convex reads are public,
 * so no Supabase session is needed; demo sessions are flagged read-only so a
 * guest cannot mutate real data (see `isDemo` in the auth store).
 */
export const DEMO_STORE = {
  tenantId: "fd038e82-96e5-4ce6-afe6-4d91264fb26d",
  tenantSlug: "webnegosyo-coffee",
  tenantName: "WebNegosyo Coffee (Demo)",
  convexUrl: "https://accomplished-lynx-206.convex.cloud",
} as const;

/** Friendly message shown when a guest attempts a write in demo mode. */
export const DEMO_READONLY_MESSAGE =
  "You're exploring the demo store. Create your own store to manage live orders.";

/**
 * The session a guest gets from "Explore the demo store" (welcome and login
 * screens): no user, the demo tenant, and `isDemo` so every write is refused.
 */
export function demoSessionAuth() {
  return {
    userId: null,
    tenantId: DEMO_STORE.tenantId,
    tenantSlug: DEMO_STORE.tenantSlug,
    tenantName: DEMO_STORE.tenantName,
    convexUrl: DEMO_STORE.convexUrl,
    isLoading: false,
    isAuthenticated: true,
    isDemo: true,
  } as const;
}
