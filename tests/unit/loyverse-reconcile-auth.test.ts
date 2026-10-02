/**
 * Authorising the reconcile cron.
 *
 * The reconcile endpoint re-imports EVERY Loyverse tenant's catalog — a
 * five-minute, platform-wide job. It used to also accept the webhook secret
 * as `?secret=`, and that secret was embedded in every merchant's registered
 * webhook URL, so any merchant could start it at will. Now it takes only the
 * Vercel cron bearer, and an unset CRON_SECRET must never open it.
 */

import { isAuthorizedReconcileRequest } from '@/lib/loyverse/reconcile-auth'

describe('isAuthorizedReconcileRequest', () => {
  it('accepts the Vercel cron bearer token', () => {
    expect(isAuthorizedReconcileRequest('Bearer cron-token', 'cron-token')).toBe(true)
  })

  it('rejects a wrong bearer token', () => {
    expect(isAuthorizedReconcileRequest('Bearer nope', 'cron-token')).toBe(false)
  })

  it('rejects a token that is a prefix of the secret', () => {
    expect(isAuthorizedReconcileRequest('Bearer cron', 'cron-token')).toBe(false)
  })

  it('rejects everything when no secret is configured', () => {
    expect(isAuthorizedReconcileRequest(null, null)).toBe(false)
    expect(isAuthorizedReconcileRequest('Bearer anything', undefined)).toBe(false)
  })

  it('does not let an empty bearer token match an unset cron secret', () => {
    expect(isAuthorizedReconcileRequest('Bearer ', '')).toBe(false)
  })

  it('ignores a non-bearer authorization scheme', () => {
    expect(isAuthorizedReconcileRequest('Basic cron-token', 'cron-token')).toBe(false)
  })
})
