/**
 * Authorisation for the Loyverse reconcile endpoint.
 *
 * Pure so the "an unset secret must never authorize" rule is unit testable
 * rather than a property of a route handler nobody exercises.
 *
 * Two accepted credentials, because the endpoint has two callers: a human or
 * script passing `?secret=` (the existing shared LOYVERSE_WEBHOOK_SECRET), and
 * the Vercel cron, which sends `Authorization: Bearer $CRON_SECRET` and cannot
 * pass a query secret without it being committed to vercel.json.
 */

export interface ReconcileSecrets {
  webhookSecret: string | null | undefined
  cronSecret: string | null | undefined
}

const BEARER_PREFIX = 'Bearer '

export function isAuthorizedReconcileRequest(
  querySecret: string | null | undefined,
  authorizationHeader: string | null | undefined,
  secrets: ReconcileSecrets
): boolean {
  const { webhookSecret, cronSecret } = secrets

  // A configured secret is required on both paths: comparing two empty values
  // must never succeed, or forgetting the env var opens the endpoint.
  if (webhookSecret && querySecret && querySecret === webhookSecret) return true

  if (cronSecret && authorizationHeader?.startsWith(BEARER_PREFIX)) {
    const token = authorizationHeader.slice(BEARER_PREFIX.length)
    if (token && token === cronSecret) return true
  }

  return false
}
