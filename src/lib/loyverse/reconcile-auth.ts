/**
 * Authorisation for the Loyverse reconcile endpoint.
 *
 * Pure so the "an unset secret must never authorize" rule is unit testable
 * rather than a property of a route handler nobody exercises.
 *
 * ONE credential: `Authorization: Bearer $CRON_SECRET`, which the Vercel cron
 * sends (run it by hand with the same header). The endpoint used to also take
 * `?secret=LOYVERSE_WEBHOOK_SECRET` — the very secret that was embedded in
 * every merchant's registered webhook URL, which let any merchant start the
 * platform-wide, five-minute reconcile of every tenant at will.
 */

import { secretsEqual } from '@/lib/loyverse/secret-compare'

const BEARER_PREFIX = 'Bearer '

export function isAuthorizedReconcileRequest(
  authorizationHeader: string | null | undefined,
  cronSecret: string | null | undefined
): boolean {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) return false
  return secretsEqual(authorizationHeader.slice(BEARER_PREFIX.length), cronSecret)
}
