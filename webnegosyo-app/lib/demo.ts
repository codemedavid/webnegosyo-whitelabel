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
