import type { AppResolve } from '@/lib/app-contract'
import { appCachedOk, appRefusal, appRoute } from '@/lib/app-api/app-route'
import { defineRoute } from '@/platform/http/define-route'

/**
 * GET /api/app/v1/resolve  (header X-App-Id: <bundle id | android package>)
 *
 * The first call a customer-app build makes: which store it is, and the
 * release gate (must-update floor, latest version, store link) per platform.
 * A paused store still resolves, so the app can explain instead of failing.
 */
export const GET = defineRoute({
  auth: { kind: 'public' },
  rateLimit: { bucket: 'app:resolve', per: 'ip', max: 60, window: '1m', onRedisFailure: 'instance' },
  onRefusal: appRefusal,
  handler: appRoute({ scope: 'resolve', allowPaused: true }, async ({ request, app }) => {
  const body: AppResolve = { tenantId: app.tenantId, slug: app.slug, status: app.status, ios: app.ios, android: app.android }
  return appCachedOk(request, body, 300)
}),
})
