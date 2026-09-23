import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveTenantSlugFromRequest } from '@/lib/tenant'
import { hasPermission, permissionForAdminPath } from '@/lib/staff-permissions'
import { canViewBranchDirectory, isStoreWideAdminPath } from '@/lib/outlets/branch-scope'
import { asAppUserQueryClient, fetchAppUserScope } from '@/lib/queries/fetch-app-user-scope'
import { isMcpProtocolRoute } from '@/lib/mcp/route-isolation'
import { rewriteMcpPathWellKnown } from '@/lib/mcp/mcp-path-well-known'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'
import { createLogger } from '@/lib/logger'
import {
  FRAME_PROTECTION_HEADERS,
  hasSupabaseCookie,
  isFrameProtectedPath,
  isPublicRoute,
  isSelfAuthenticatedApiRoute,
  normalizePathname,
  tenantAdminSlugFor,
  tenantRewritePath,
} from '@/lib/middleware/routes'

/**
 * Edge middleware: tenant rewrite, session refresh, access gates.
 *
 * Vercel stops a middleware that has not answered in 25s and the visitor
 * sees a 504, so nothing here may wait on the database without a bound. Every
 * Supabase call goes through a fetch that gives up after a few seconds, the
 * tenant lookup is served from an in-memory directory, and a visitor without
 * a session cookie never reaches GoTrue at all. When the database is unwell
 * the site degrades (no session, no tenant) instead of disappearing.
 */

/** A GoTrue or PostgREST call that has not come back in this long is treated as "no answer". */
const AUTH_FETCH_TIMEOUT_MS = 3000

/** `debug` is off unless `DEBUG_MIDDLEWARE=true`; `error` is never gated. */
const log = createLogger('[Middleware]', 'DEBUG_MIDDLEWARE')

type SupabaseMiddlewareClient = ReturnType<typeof createServerClient>

interface SessionContext {
  supabase: SupabaseMiddlewareClient
  /** The current response; `setAll` replaces it when a refreshed cookie must be written. */
  response: () => NextResponse
}

/**
 * The Supabase client for this request, wired so a refreshed session cookie
 * lands on whichever response we end up sending (a rewrite must survive).
 */
function createSessionContext(request: NextRequest, initial: NextResponse): SessionContext {
  let response = initial
  const rewriteUrl = initial.headers.get('x-middleware-rewrite')

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = rewriteUrl ? NextResponse.rewrite(new URL(rewriteUrl), { request }) : NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
    db: { retry: false },
    global: { fetch: createTimedFetch(AUTH_FETCH_TIMEOUT_MS) },
  })

  return { supabase, response: () => response }
}

/**
 * Rewrite a request on a tenant host (`shop.webnegosyo.com/cart`) to the
 * unified path route (`/shop/cart`). Never blocks: a failed lookup is logged
 * with its host and path and the request proceeds un-rewritten.
 */
async function rewriteForTenantHost(
  request: NextRequest
): Promise<{ response: NextResponse; tenantSlug: string | null }> {
  const pathname = normalizePathname(request.nextUrl.pathname)
  const { search } = request.nextUrl
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'unknown'

  try {
    const tenantSlug = await resolveTenantSlugFromRequest(request)
    const targetPath = tenantRewritePath(tenantSlug, pathname)
    if (!targetPath) return { response: NextResponse.next({ request }), tenantSlug }

    const rewrittenUrl = request.nextUrl.clone()
    rewrittenUrl.pathname = targetPath
    rewrittenUrl.search = search
    log.debug(`Rewriting ${host}${pathname} to ${targetPath}`, { tenantSlug, host })
    return { response: NextResponse.rewrite(rewrittenUrl), tenantSlug }
  } catch (error) {
    log.error('Error resolving tenant:', { host, pathname, error: error instanceof Error ? error.message : String(error) })
    return { response: NextResponse.next({ request }), tenantSlug: null }
  }
}

/**
 * IMPORTANT: DO NOT REMOVE `auth.getUser()` — it is what refreshes an admin's
 * session cookie; Server Components cannot write cookies themselves. It runs
 * on every path for a visitor WITH a cookie: public pages read the session
 * from Server Components, and a refresh they trigger but cannot persist burns
 * the rotating refresh token and ends the session.
 *
 * A timed-out or failed GoTrue call fails closed for access (the visitor is
 * bounced to login) but open for the site (no 504).
 */
async function getSessionUser(supabase: SupabaseMiddlewareClient) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  } catch (error) {
    log.error('Session lookup failed:', error)
    return null
  }
}

function redirectTo(request: NextRequest, pathname: string, params: Record<string, string> = {}): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return NextResponse.redirect(url)
}

type SessionUser = Awaited<ReturnType<typeof getSessionUser>>

/** Add anti-clickjacking headers when `servedPathname` is an admin/login page. */
function withFrameProtection(response: NextResponse, servedPathname: string): NextResponse {
  if (!isFrameProtectedPath(servedPathname)) return response
  Object.entries(FRAME_PROTECTION_HEADERS).forEach(([name, value]) => response.headers.set(name, value))
  return response
}

/** `/superadmin/*` requires a signed-in user with the `superadmin` role. */
async function guardSuperadmin(
  request: NextRequest,
  supabase: SupabaseMiddlewareClient,
  user: SessionUser,
  pathname: string
): Promise<NextResponse | null> {
  if (isPublicRoute(pathname)) return null
  if (!user) return redirectTo(request, '/superadmin/login')

  const { data: roleRow } = await supabase.from('app_users').select('role').eq('user_id', user.id).maybeSingle()
  if (roleRow?.role !== 'superadmin') return redirectTo(request, '/superadmin/login', { unauthorized: '1' })
  return null
}

/**
 * `/<slug>/admin/*` requires an admin of that tenant (or a superadmin), and
 * staff with restricted permissions may only open the sections they were
 * granted. Store-wide sections are closed to an account that runs one branch;
 * the nav hides them too, but typing the URL must not be a way around it.
 */
async function guardTenantAdmin(
  request: NextRequest,
  supabase: SupabaseMiddlewareClient,
  user: SessionUser,
  tenantSlug: string,
  /** The pathname that will be served — the rewrite target on a tenant host. */
  pathname: string
): Promise<NextResponse | null> {
  if (!user) return redirectTo(request, `/${tenantSlug}/login`, { redirect: pathname })

  // The resilient read adds the branch column this gate needs and falls back
  // to the pre-branch projection rather than 400ing every admin page if the
  // migration is not applied yet.
  const { appUser } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)
  if (appUser?.role === 'superadmin') return null

  const unauthorized = () => redirectTo(request, `/${tenantSlug}/login`, { unauthorized: '1' })
  if (appUser?.role !== 'admin') return unauthorized()

  const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).eq('is_active', true).maybeSingle()
  if (!tenant || appUser.tenant_id !== (tenant as { id: string }).id) return unauthorized()

  const requiredPermission = permissionForAdminPath(pathname)
  if (requiredPermission && !hasPermission(appUser, requiredPermission)) {
    return redirectTo(request, `/${tenantSlug}/admin`, { denied: requiredPermission })
  }
  if (isStoreWideAdminPath(pathname) && !canViewBranchDirectory(appUser)) {
    return redirectTo(request, `/${tenantSlug}/admin`, { denied: 'branches' })
  }
  return null
}

export async function middleware(request: NextRequest) {
  // Classified on the collapsed form so `//shop/admin` and `/shop/admin` are
  // the same path to every gate below.
  const pathname = normalizePathname(request.nextUrl.pathname)

  // MCP transport, OAuth, and discovery endpoints form a self-contained
  // protocol boundary. They authenticate Bearer credentials or OAuth browser
  // sessions in their route handlers and must not be rewritten, refreshed, or
  // otherwise coupled to the tenant/application middleware.
  if (isMcpProtocolRoute(pathname)) {
    const wellKnownDestination = rewriteMcpPathWellKnown(pathname)
    if (!wellKnownDestination) return NextResponse.next({ request })
    const rewrittenUrl = request.nextUrl.clone()
    rewrittenUrl.pathname = wellKnownDestination
    return NextResponse.rewrite(rewrittenUrl)
  }

  if (isSelfAuthenticatedApiRoute(pathname)) return NextResponse.next({ request })

  const isSuperAdminRoute = pathname.startsWith('/superadmin')
  const rewritten = isSuperAdminRoute
    ? { response: NextResponse.next({ request }), tenantSlug: null as string | null }
    : await rewriteForTenantHost(request)

  const session = createSessionContext(request, rewritten.response)
  // The access gates still run for an anonymous visitor — an anonymous hit on
  // /admin must still bounce to login — they just do so without GoTrue.
  const user = hasSupabaseCookie(request.cookies.getAll()) ? await getSessionUser(session.supabase) : null

  if (isSuperAdminRoute) {
    const response = (await guardSuperadmin(request, session.supabase, user, pathname)) ?? session.response()
    return withFrameProtection(response, pathname)
  }

  // Host-based visits arrive as `/admin`, then get rewritten to `/shop/admin`.
  // Gate on the rewrite target or a restricted staff URL on a tenant host
  // would skip the permission check.
  const servedPathname = tenantRewritePath(rewritten.tenantSlug, pathname) ?? pathname
  const tenantSlug = tenantAdminSlugFor(servedPathname)
  if (tenantSlug) {
    const response =
      (await guardTenantAdmin(request, session.supabase, user, tenantSlug, servedPathname)) ?? session.response()
    return withFrameProtection(response, servedPathname)
  }

  return withFrameProtection(session.response(), servedPathname)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization - IMPORTANT: prevents 431 errors from large cookies)
     * - favicon.ico (favicon file)
     * - Common image formats
     * - API routes for images
     */
    '/((?!monitoring|_next/static|_next/image|favicon.ico|api/upload|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
