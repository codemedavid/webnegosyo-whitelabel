/**
 * Namespaced logging for the request path, shared by the edge middleware and
 * the tenant resolver.
 *
 * Two problems this replaces:
 *
 * 1. The same gate — `NODE_ENV === 'development' || DEBUG_* === 'true'` — was
 *    written inline three times in `middleware.ts` and once more inside
 *    `tenant.ts`'s private `debugLog`. Four copies of one policy.
 *
 * 2. Because the gate included `NODE_ENV === 'development'`, tracing was on by
 *    default locally. Middleware re-runs for RSC prefetches and client-side
 *    navigations, not just document requests, so a single page view printed the
 *    tenant-resolution triplet several times over. Signal drowned in it.
 *
 * So debug output is now strictly opt-in by namespace: set `DEBUG_TENANT_RESOLUTION=true`
 * (or `DEBUG_ALL=true`) when you are actually debugging routing. `error` is
 * never gated — commit 2b1ce6b4 deliberately kept the middleware's catch-block
 * errors visible in production logs, and that must survive this refactor.
 *
 * Edge-runtime constraints: no Node built-ins, no transports, no async. The
 * `process.env` reads below are static property accesses so bundlers can inline
 * them; a dynamic `process.env[key]` would not survive that inlining.
 */

/** Debug namespaces. Add the flag here and it is readable everywhere. */
export type DebugFlagKey = 'DEBUG_TENANT_RESOLUTION' | 'DEBUG_MIDDLEWARE'

/** The subset of the environment the gate consults. */
export interface DebugFlags {
  DEBUG_TENANT_RESOLUTION?: string
  DEBUG_MIDDLEWARE?: string
  /** Turns on every namespace at once. */
  DEBUG_ALL?: string
  /** Read only so callers can reason about it; it does NOT enable tracing. */
  NODE_ENV?: string
}

/**
 * Snapshot the debug flags from the ambient environment.
 *
 * Called per log statement rather than once at module load: an edge worker is
 * long-lived, and reading late is what lets a flag flip take effect without a
 * redeploy. The cost is a few property reads on a code path that is already
 * doing network I/O.
 */
export function readDebugFlags(): DebugFlags {
  return {
    DEBUG_TENANT_RESOLUTION: process.env.DEBUG_TENANT_RESOLUTION,
    DEBUG_MIDDLEWARE: process.env.DEBUG_MIDDLEWARE,
    DEBUG_ALL: process.env.DEBUG_ALL,
    NODE_ENV: process.env.NODE_ENV,
  }
}

/**
 * Whether tracing is on for one namespace.
 *
 * Exactly `'true'` counts — a stray `DEBUG_TENANT_RESOLUTION=1` in a `.env`
 * should not silently re-flood the console.
 */
export function isDebugEnabled(key: DebugFlagKey, flags: DebugFlags = readDebugFlags()): boolean {
  return flags[key] === 'true' || flags.DEBUG_ALL === 'true'
}

export interface Logger {
  /** Gated tracing. Silent unless the namespace is switched on. */
  debug(message: string, data?: Record<string, unknown>): void
  /** Never gated — always reaches the platform log. */
  error(message: string, data?: unknown): void
}

/**
 * Build a logger for one namespace.
 *
 * @param label     Prefix on every line, e.g. `[Tenant Resolution]`.
 * @param key       The debug flag that switches this namespace on.
 * @param readFlags Injection seam for tests; defaults to the real environment.
 */
export function createLogger(
  label: string,
  key: DebugFlagKey,
  readFlags: () => DebugFlags = readDebugFlags
): Logger {
  return {
    debug(message, data) {
      if (!isDebugEnabled(key, readFlags())) return
      // Passing `undefined` explicitly would print a trailing "undefined".
      if (data === undefined) {
        console.log(`${label} ${message}`)
        return
      }
      console.log(`${label} ${message}`, data)
    },

    error(message, data) {
      if (data === undefined) {
        console.error(`${label} ${message}`)
        return
      }
      console.error(`${label} ${message}`, data)
    },
  }
}
