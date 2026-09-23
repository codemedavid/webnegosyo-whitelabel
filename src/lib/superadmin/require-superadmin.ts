import { NextResponse } from 'next/server'
import { getCurrentUserRole } from '@/lib/admin-service'

/**
 * Cookie-session superadmin check for web-console route handlers.
 *
 * Route handlers are public URLs whatever the middleware page gate says, so
 * each one re-checks the role from app_users. Returns a ready 403 response
 * when the caller is not a superadmin, or null to proceed.
 */
export async function requireSuperadminResponse(): Promise<NextResponse | null> {
  const role = (await getCurrentUserRole()) as { role?: string } | null
  if (role?.role === 'superadmin') return null
  return NextResponse.json(
    { success: false, data: null, error: 'Superadmin access required' },
    { status: 403, headers: NO_STORE_HEADERS },
  )
}

/** Per-user data: never let a shared cache keep it. */
export const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const
