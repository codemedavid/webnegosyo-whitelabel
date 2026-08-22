/**
 * Authorising the reconcile cron.
 *
 * The reconcile endpoint is the safety net behind Loyverse webhooks (which
 * Loyverse disables permanently after 48h of failures). It only self-heals if
 * something actually calls it on a schedule — and a Vercel cron cannot carry
 * `?secret=` without that secret being committed to vercel.json.
 *
 * So the route accepts either credential: the existing query secret, or the
 * `Authorization: Bearer $CRON_SECRET` header Vercel sends. Neither may be
 * satisfied by an unset environment variable, which is the failure mode that
 * would turn a missing config into an open endpoint.
 */

import { isAuthorizedReconcileRequest } from '@/lib/loyverse/reconcile-auth'

describe('isAuthorizedReconcileRequest', () => {
  it('accepts the shared query secret', () => {
    expect(
      isAuthorizedReconcileRequest('s3cret', null, { webhookSecret: 's3cret', cronSecret: null })
    ).toBe(true)
  })

  it('accepts the Vercel cron bearer token', () => {
    expect(
      isAuthorizedReconcileRequest(null, 'Bearer cron-token', {
        webhookSecret: 's3cret',
        cronSecret: 'cron-token',
      })
    ).toBe(true)
  })

  it('rejects a wrong query secret', () => {
    expect(
      isAuthorizedReconcileRequest('nope', null, { webhookSecret: 's3cret', cronSecret: null })
    ).toBe(false)
  })

  it('rejects a wrong bearer token', () => {
    expect(
      isAuthorizedReconcileRequest(null, 'Bearer nope', {
        webhookSecret: null,
        cronSecret: 'cron-token',
      })
    ).toBe(false)
  })

  it('rejects everything when no secret is configured', () => {
    // The dangerous case: an unset env var must never make the endpoint open.
    expect(
      isAuthorizedReconcileRequest(null, null, { webhookSecret: null, cronSecret: null })
    ).toBe(false)
  })

  it('does not let an empty query secret match an unset webhook secret', () => {
    expect(
      isAuthorizedReconcileRequest('', null, { webhookSecret: null, cronSecret: null })
    ).toBe(false)
  })

  it('does not let an empty bearer token match an unset cron secret', () => {
    expect(
      isAuthorizedReconcileRequest(null, 'Bearer ', { webhookSecret: null, cronSecret: null })
    ).toBe(false)
  })

  it('ignores a non-bearer authorization scheme', () => {
    expect(
      isAuthorizedReconcileRequest(null, 'Basic cron-token', {
        webhookSecret: null,
        cronSecret: 'cron-token',
      })
    ).toBe(false)
  })
})
