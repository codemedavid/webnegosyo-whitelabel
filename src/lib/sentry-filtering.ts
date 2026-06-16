// Shared Sentry configuration helpers used by all three init points
// (client, server, edge). Keep this module pure and runtime-agnostic — it must
// import cleanly in the browser, the Node server, and the edge runtime, so it
// must not touch runtime-specific globals at module load time.
//
// Why this exists: the project's Sentry dashboard was flooded with events that
// originate from the local Turbopack dev server — hot-module-reload races,
// `next-devtools` segment-explorer modules, "module factory is not available"
// errors, transient "Module not found" compile errors, aborted sockets, and
// Safari "Load failed" network blips. None of these are real, user-facing
// production bugs (every such issue had userCount=0 and environment=development).
// We stop them at the source with: (1) disabling event delivery outside
// production, and (2) ignoreErrors / denyUrls / beforeSend noise filters as
// defense-in-depth for stale deploys and browser-extension noise.

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
  // --- Turbopack / Next.js dev-server & build artifacts (never reach users) ---
  /was instantiated because it was required from module/i,
  /the module factory is not available/i,
  /Could not find the module/i,
  /Module \[project\]/i,
  /next-devtools/i,
  /segment-explorer/i,
  /__TURBOPACK__/i,
  /\[turbopack\]/i,
  /Module not found: Can.?t resolve/i,
  /Cannot find module '\.\/.+\.runtime/i,

  // --- Network / request-abort noise (tab close, flaky wifi, ad-blockers) ---
  "Load failed", // Safari failed/aborted fetch
  "Failed to fetch", // Chrome failed fetch
  /NetworkError when attempting to fetch/i,
  /The network connection was lost/i,
  /Network request failed/i,
  /cancelled/i, // Safari aborted XHR
  "AbortError",
  /The (user )?operation was aborted/i,
  /^(Error: )?aborted$/i, // Node socket abort on client disconnect

  // --- Benign browser noise ---
  /ResizeObserver loop/i,
];

/**
 * Script URLs (browser only) whose errors are pure framework/extension noise.
 * denyUrls only applies to client events that carry a stack with URLs.
 */
export const SENTRY_DENY_URLS: RegExp[] = [
  /next-devtools/i,
  /\[turbopack\]/i,
  /app-page-turbo\.runtime/i,
  // Browser extensions throwing inside our pages
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:\/\//i,
  /extensions\//i,
];

// Minimal structural type so this module does not depend on a specific
// @sentry/nextjs type-export name across SDK versions.
interface MinimalSentryEvent {
  message?: string;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: { frames?: Array<{ filename?: string; abs_path?: string; module?: string }> };
    }>;
  };
}

const FRAME_NOISE = [
  /next-devtools/i,
  /\[turbopack\]/i,
  /turbopack-edge-wrapper/i,
  /app-page-turbo\.runtime/i,
];

const valueMatches = (text: string | undefined): boolean => {
  if (!text) return false;
  return SENTRY_IGNORE_ERRORS.some((p) =>
    typeof p === "string" ? text.includes(p) : p.test(text)
  );
};

/**
 * beforeSend hook (shared). Drops framework/dev noise that ignoreErrors/denyUrls
 * may miss — in particular server & edge Turbopack module-evaluation errors,
 * where there are no URLs for denyUrls to match. Returns null to discard.
 */
export const filterSentryEvent = <T extends MinimalSentryEvent>(event: T): T | null => {
  if (valueMatches(event.message)) return null;

  const values = event.exception?.values ?? [];
  for (const ex of values) {
    if (valueMatches(ex.value) || valueMatches(ex.type)) return null;
    if (valueMatches(`${ex.type ?? ""}: ${ex.value ?? ""}`)) return null;

    const frames = ex.stacktrace?.frames ?? [];
    for (const frame of frames) {
      const loc = frame.filename || frame.abs_path || frame.module || "";
      if (FRAME_NOISE.some((p) => p.test(loc))) return null;
    }
  }

  return event;
};
