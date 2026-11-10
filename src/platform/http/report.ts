/**
 * An unexpected failure inside an entry point: written to the platform log and
 * sent to Sentry, and never to the caller.
 *
 * Sentry hears about an error a route throws through Next's `onRequestError`
 * hook (`instrumentation.ts`). The wrappers catch the error to answer with a
 * safe message, so that hook never fires for them; this reports it instead.
 */

import { createLogger } from '@/lib/logger'

const log = createLogger('[entry-points]', 'DEBUG_ENTRY_POINTS')

export interface FailureContext {
  surface: 'route' | 'action'
  /** `POST /api/x` or the action's kind: enough to find the entry, nothing from its input. */
  entry: string
}

export function reportFailure(error: unknown, context: FailureContext): void {
  log.error(`${context.surface} handler failed`, {
    entry: context.entry,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  // Loaded on the failure path only, and never allowed to turn one failure into two.
  void import('@sentry/nextjs')
    .then((Sentry) => Sentry.captureException(error, { tags: { area: 'entry_point', surface: context.surface, entry: context.entry } }))
    .catch(() => undefined)
}

/** Opt-in tracing of refusals (`DEBUG_ENTRY_POINTS=true`): which rule turned a call away. */
export function traceRefusal(context: FailureContext, code: string, status: number): void {
  log.debug('refused', { ...context, code, status })
}
