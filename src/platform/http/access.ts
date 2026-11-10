/**
 * Who is calling, answered through the checks the app already has.
 *
 * Nothing here decides access on its own. Each kind of entry hands the
 * question to the helper that has always answered it, and turns the answer
 * into one shape the two wrappers share:
 *
 *   staff, Bearer-only      → `requireBearerStoreCaller` / `authenticateBearer`
 *   staff, cookie or Bearer → `verifyTenantPermission` / `verifyTenantAdmin`
 *   staff feature key       → `callerHasFeature`, `hasAnyPermission`
 *   staff branch            → `resolveBranchScope`, `resolveCallerOutlet`, `resolveRouteOutlet`
 *   superadmin              → `requirePlatformPermission` / `requireFullSuperadmin`
 *   cron                    → `isAuthorizedReconcileRequest` (Bearer $CRON_SECRET)
 *   device, signature       → the `verify` function the entry declares
 *
 * Fails closed: a helper that throws something unexpected, or a `verify` that
 * throws, is a refusal (`unavailable` / `unauthenticated`), never a pass.
 *
 * This file holds the shared shapes and the kinds whose credential is in the
 * request itself. The session kinds (staff, superadmin) live in
 * `access-session.ts` and are loaded only by entries that declare them, so a
 * cron or webhook route does not pull the admin stack into its bundle.
 */

import { unstable_rethrow } from 'next/navigation'
import { createLogger } from '@/lib/logger'
import { isAuthorizedReconcileRequest } from '@/lib/loyverse/reconcile-auth'
import type { DeviceAuth, DeviceCallerContext, RefusalCode, SignatureAuth } from './entry'

const log = createLogger('[entry-points]', 'DEBUG_ENTRY_POINTS')

/** A refusal before the surface (route or action) words it. */
export interface AccessRefusal {
  code: RefusalCode
  /** The existing helper's own ready response, passed through so its body never drifts. */
  response?: Response
  /** A sentence more exact than the code's default (still safe to show). */
  message?: string
}

/** Who the rate limiter counts. */
export interface RateSubject {
  userId?: string
  tenant?: string
}

export type AccessResult<TCaller> =
  | { ok: true; caller: TCaller; subject: RateSubject }
  | { ok: false; refusal: AccessRefusal }

export function refuse(code: RefusalCode, extra: Omit<AccessRefusal, 'code'> = {}): { ok: false; refusal: AccessRefusal } {
  return { ok: false, refusal: { code, ...extra } }
}

export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/** The access check could not be completed: logged, and refused. */
export function unavailable(kind: string, error: unknown): { ok: false; refusal: AccessRefusal } {
  log.error('access check failed', { kind, error: describeError(error) })
  return refuse('unavailable')
}

/** `Authorization: Bearer $CRON_SECRET`. An unset secret never authorizes. */
export function resolveCronAccess(request: Request): AccessResult<unknown> {
  return isAuthorizedReconcileRequest(request.headers.get('authorization'), process.env.CRON_SECRET)
    ? { ok: true, caller: {}, subject: {} }
    : refuse('unauthenticated')
}

export async function resolveDeviceAccess<TDevice>(
  request: Request,
  auth: DeviceAuth<TDevice>,
): Promise<AccessResult<DeviceCallerContext<TDevice>>> {
  try {
    const device = await auth.verify(request)
    return device === null || device === undefined
      ? refuse('unauthenticated')
      : { ok: true, caller: { device }, subject: {} }
  } catch (error) {
    unstable_rethrow(error)
    log.error('device check failed', { scheme: auth.scheme, error: describeError(error) })
    return refuse('unauthenticated')
  }
}

export async function resolveSignatureAccess(
  request: Request,
  auth: SignatureAuth,
  rawBody: string,
): Promise<AccessResult<unknown>> {
  try {
    // Exactly `true`: a verifier that returns something truthy by accident does not pass.
    return (await auth.verify(request, rawBody)) === true
      ? { ok: true, caller: {}, subject: {} }
      : refuse('unauthenticated')
  } catch (error) {
    unstable_rethrow(error)
    log.error('signature check failed', { scheme: auth.scheme, error: describeError(error) })
    return refuse('unauthenticated')
  }
}
