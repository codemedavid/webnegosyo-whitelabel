// Shared Sentry configuration helpers used by all three init points
// (client, server, edge). Keep this module pure and runtime-agnostic — it must
// import cleanly in the browser, the Node server, and the edge runtime, so it
// must not touch runtime-specific globals at module load time.
//
// Development delivery is disabled below. Do not also suppress module-loading
// or network failures: production builds use Turbopack too, and failed chunks
// and fetches can take down the admin dashboard or storefront.

/**
 * Whether Sentry should actually deliver events. We only send from real
 * deployments (NODE_ENV === "production"), which keeps the local dev server's
 * Turbopack/HMR noise out of the dashboard entirely. Set
 * SENTRY_FORCE_ENABLE=true (or NEXT_PUBLIC_SENTRY_FORCE_ENABLE=true for the
 * browser) to opt back in while debugging Sentry locally.
 */
export const isSentryEnabled = (): boolean => {
  if (
    process.env.SENTRY_FORCE_ENABLE === "true" ||
    process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === "true"
  ) {
    return true;
  }
  return process.env.NODE_ENV === "production";
};

/**
 * Deployment environment tag. Prefer Vercel's env (production | preview |
 * development) and fall back to NODE_ENV for local/other hosts.
 */
export const sentryEnvironment =
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV;

/**
 * Error messages / exception values that should never be reported. These are
 * matched by the Sentry SDK against the event message and each exception's
 * "type: value". Matched on both client and server/edge.
 *
 * Deliberately NOT included: hydration errors. Those are genuine bugs we want
 * to keep seeing from real production traffic.
 */
export const SENTRY_IGNORE_ERRORS: (string | RegExp)[] = [
  // --- Benign browser noise ---
  /ResizeObserver loop/i,
];

/**
 * Script URLs (browser only) whose errors originate in browser extensions.
 * denyUrls only applies to client events that carry a stack with URLs.
 */
export const SENTRY_DENY_URLS: RegExp[] = [
  // Browser extensions throwing inside our pages
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:\/\//i,
];

// Minimal structural type so this module does not depend on a specific
// @sentry/nextjs type-export name across SDK versions.
interface MinimalSentryEvent {
  message?: string;
  tags?: Record<string, unknown>;
  request?: { url?: string };
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: { frames?: Array<{ filename?: string; abs_path?: string; module?: string }> };
    }>;
  };
}

const valueMatches = (text: string | undefined): boolean => {
  if (!text) return false;
  return SENTRY_IGNORE_ERRORS.some((p) =>
    typeof p === "string" ? text.includes(p) : p.test(text)
  );
};

/**
 * beforeSend hook (shared). Only drops known benign notifications. A framework
 * frame in a stack is not evidence that an application exception is harmless.
 */
export const filterSentryEvent = <T extends MinimalSentryEvent>(event: T): T | null => {
  if (valueMatches(event.message)) return null;

  const values = event.exception?.values ?? [];
  for (const ex of values) {
    if (valueMatches(ex.value) || valueMatches(ex.type)) return null;
    if (valueMatches(`${ex.type ?? ""}: ${ex.value ?? ""}`)) return null;
  }

  return event;
};

/** Tag automatic and explicitly captured browser errors without recording form data. */
export const filterSentryClientEvent = <T extends MinimalSentryEvent>(event: T): T | null => {
  const filtered = filterSentryEvent(event);
  if (!filtered || typeof window === 'undefined') return filtered;

  let pathname = window.location.pathname;
  try {
    if (event.request?.url) pathname = new URL(event.request.url, window.location.origin).pathname;
  } catch {
    // Fall back to the current path when an event contains a malformed URL.
  }

  const segments = pathname.split('/').filter(Boolean);
  const areas = ['admin', 'menu', 'cart', 'checkout', 'order', 'b', 'login', 'subscription', 'about', 'privacy', 'terms', 'refund'];
  const tenantSlug = !areas.includes(segments[0]) && areas.includes(segments[1]) && segments[0] !== 'superadmin'
    ? segments[0] : undefined;
  const area = tenantSlug ? segments[1] : segments[0];
  const appSurface = area === 'superadmin' ? 'superadmin'
    : area === 'admin' ? 'admin'
    : areas.includes(area) ? 'storefront' : 'platform';

  return {
    ...filtered,
    tags: { ...filtered.tags, appSurface, ...(tenantSlug ? { tenantSlug } : {}) },
  };
};
