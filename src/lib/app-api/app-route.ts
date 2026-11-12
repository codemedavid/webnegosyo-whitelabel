import 'server-only'

import * as Sentry from '@sentry/nextjs'
import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { Refusal } from '@/platform/http/entry'
import { readApplicationId } from './app-identity'
import { appFail, appOk } from './respond'
import { AppReadError } from './store-reads'
import { getTenantApp, type ResolvedTenantApp } from './tenant-app'

/**
 * The handler half of every public `/api/app/v1` route. The route itself is
 * declared with `defineRoute` (`auth: { kind: 'public' }`, its per-IP limit as
 * `bucket: 'app:<scope>'`, `onRefusal: appRefusal`), which counts the request
 * before anything is read. This then resolves the calling build's store from
 * `X-App-Id`, wraps the contract envelope and reports anything unexpected. The
 * store comes from the build's identity, never from the query or body, so one
 * store's app cannot read as another's. Routes that need a signed-in customer
 * check the `cs1.` session inside their handler, against this store.
 */

export interface AppRouteContext {
  request: NextRequest
  app: ResolvedTenantApp
}

interface AppRouteOptions {
  scope: string
  /** Resolve answers a paused store (so the app can say so); data routes refuse it. */
  allowPaused?: boolean
}

const NOT_SET_UP = 'This app is not connected to a store yet.'
const PAUSED = 'This store is not taking app orders right now.'
const TRY_AGAIN = 'We could not reach the store. Please try again in a moment.'
const SOMETHING_WENT_WRONG = 'Something went wrong. Please try again.'

/**
 * `defineRoute`'s refusals in the app contract's envelope: the app reads
 * `error.code`, never the platform's default `{ error }` body.
 */
export function appRefusal(refusal: Refusal): Response {
  if (refusal.code === 'rate-limited') {
    return appFail('rate_limited', 'Too many requests. Please wait a moment.', { retryAfterSec: refusal.retryAfterSec })
  }
  if (refusal.code === 'invalid') return appFail('bad_request', 'This request is not valid.')
  return appFail('internal', SOMETHING_WENT_WRONG)
}

export function appRoute(options: AppRouteOptions, handler: (context: AppRouteContext) => Promise<NextResponse>) {
  return async ({ request }: { request: NextRequest }): Promise<NextResponse> => {
    const applicationId = readApplicationId(request.headers)
    if (!applicationId) return appFail('bad_request', NOT_SET_UP)

    const lookup = await getTenantApp(applicationId)
    if (lookup.error) {
      console.error(`[app-api:${options.scope}] tenant app lookup failed`, { applicationId, error: lookup.error })
      return appFail('unavailable', TRY_AGAIN)
    }
    if (!lookup.app) return appFail('not_found', NOT_SET_UP)
    if (lookup.app.status === 'paused' && !options.allowPaused) return appFail('unavailable', PAUSED)

    try {
      return await handler({ request, app: lookup.app })
    } catch (error) {
      if (error instanceof AppReadError) {
        console.error(`[app-api:${options.scope}] ${error.message}`, { tenantId: lookup.app.tenantId })
        return appFail('unavailable', TRY_AGAIN)
      }
      Sentry.captureException(error, { tags: { area: 'customer-app-api', scope: options.scope, tenantId: lookup.app.tenantId } })
      console.error(`[app-api:${options.scope}] unexpected error`, error)
      return appFail('internal', SOMETHING_WENT_WRONG)
    }
  }
}

/**
 * A cacheable read: an ETag over the body, and 304 when the phone already has
 * it. `private` because each answer is per store and per build.
 */
export function appCachedOk<T>(request: NextRequest, data: T, maxAgeSec: number): NextResponse {
  const etag = `"${createHash('sha256').update(JSON.stringify(data)).digest('base64url').slice(0, 22)}"`
  const headers = { ETag: etag, 'Cache-Control': `private, max-age=${maxAgeSec}`, Vary: 'X-App-Id' }
  if (matchesEtag(request.headers.get('if-none-match'), etag)) return new NextResponse(null, { status: 304, headers })
  return appOk(data, { headers })
}

/** RFC 9110 weak comparison: compression proxies hand back `W/"…"`, and the header may list several. */
export function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false
  const strip = (value: string) => value.trim().replace(/^W\//, '')
  return ifNoneMatch.split(',').some((candidate) => candidate.trim() === '*' || strip(candidate) === strip(etag))
}
