import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveTenantSlugFromRequest } from '@/lib/tenant'
import { hasPermission, permissionForAdminPath } from '@/lib/staff-permissions'
import { canViewBranchDirectory, isStoreWideAdminPath } from '@/lib/outlets/branch-scope'
import {
  asAppUserQueryClient,
  fetchAppUserScope,
  type AppUserScopeRow,
} from '@/lib/queries/fetch-app-user-scope'
import { isMcpProtocolRoute } from '@/lib/mcp/route-isolation'
import { rewriteMcpPathWellKnown } from '@/lib/mcp/mcp-path-well-known'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'

// Routes that authenticate themselves (webhook signatures, OAuth state, cron
// secrets) and need neither tenant resolution nor a session. Doing zero I/O
// for them matters most for the crons: `/api/loyalty/maintenance` runs every
// minute, and it was paying for a tenant lookup and a GoTrue round-trip each
// time — 16 of the 64 middleware 504s logged during the 2026-09-20 outage.
const SELF_AUTHENTICATED_API_PREFIXES = [
  '/api/webhook',
  '/api/auth/facebook',
  '/api/facebook',
  '/api/messenger',
  '/api/loyalty/maintenance',
  '/api/loyverse/reconcile',
]

// Vercel stops an edge middleware that has not answered in 25s. A GoTrue
// call that has not come back in this long is treated as "no session".
const AUTH_FETCH_TIMEOUT_MS = 3000

const isSelfAuthenticatedApiRoute = (pathname: string) =>
  SELF_AUTHENTICATED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))

// Supabase's SSR cookies are all `sb-<ref>-…`; a visitor without one has no
// session to refresh, so GoTrue has nothing to tell us. That is the bulk of
// storefront traffic. A visitor WITH one must be refreshed on every path, not
// just admin paths: public pages (menu, item detail) call getUser() from
// Server Components, which cannot write cookies, and a refresh they trigger
// but cannot persist burns the rotating refresh token and ends the session.
const hasSupabaseCookie = (request: NextRequest) =>
  request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'))

async function getSessionUser(supabase: ReturnType<typeof createServerClient>) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  } catch (error) {
    // A timed-out or failed GoTrue call fails closed for access (the visitor
    // is bounced to login) but open for the site (no 504).
    console.error('[Middleware] Session lookup failed:', error)
    return null
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const { pathname, search } = request.nextUrl

  // MCP transport, OAuth, and discovery endpoints form a self-contained
  // protocol boundary. They authenticate Bearer credentials or OAuth browser
  // sessions in their route handlers and must not be rewritten, refreshed, or
  // otherwise coupled to the tenant/application middleware.
  if (isMcpProtocolRoute(pathname)) {
    const wellKnownDestination = rewriteMcpPathWellKnown(pathname)
    if (wellKnownDestination) {
      const rewrittenUrl = request.nextUrl.clone()
      rewrittenUrl.pathname = wellKnownDestination
      return NextResponse.rewrite(rewrittenUrl)
    }
    return supabaseResponse
  }

  if (isSelfAuthenticatedApiRoute(pathname)) {
    return supabaseResponse
  }

  // Skip tenant resolution for superadmin routes
  const isSuperAdminRoute = pathname.startsWith('/superadmin')

  // Resolve tenant slug from custom domain or subdomain, and rewrite to path-based route
  // Priority: 1) Custom domain, 2) Subdomain, 3) Path-based routing
  // This keeps app routes unified under /[tenant] while supporting both custom domains and subdomains
  if (!isSuperAdminRoute) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'unknown'

    try {
      const tenantSlug = await resolveTenantSlugFromRequest(request)

      // If tenant detected (custom domain or subdomain) and current path isn't already /[tenant]/...
      // API routes are global (src/app/api) — never rewrite them to /[tenant]/api.
      if (tenantSlug && !pathname.startsWith(`/${tenantSlug}/`) && !pathname.startsWith('/api/') && pathname !== '/_next/image') {
        const rewrittenUrl = request.nextUrl.clone()
        // Redirect tenant root to tenant menu
        const targetPath = pathname === '/' ? `/${tenantSlug}/menu` : `/${tenantSlug}${pathname}`
        rewrittenUrl.pathname = targetPath
        // Maintain query string
        rewrittenUrl.search = search

        // Log successful rewrite in debug mode
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_TENANT_RESOLUTION === 'true') {
          console.log(`[Middleware] Rewriting ${host}${pathname} to ${targetPath}`, { tenantSlug, host })
        }

        supabaseResponse = NextResponse.rewrite(rewrittenUrl)
      } else if (!tenantSlug && pathname === '/') {
        // Log when tenant resolution fails for root path (this is when landing page shows)
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_TENANT_RESOLUTION === 'true') {
          console.log(`[Middleware] No tenant resolved for ${host}${pathname}, showing landing page`, { host, pathname })
        }
      }
    } catch (error) {
      // Log errors but don't block the request
      console.error('[Middleware] Error resolving tenant:', error)
      if (process.env.NODE_ENV === 'development' || process.env.DEBUG_TENANT_RESOLUTION === 'true') {
        console.error('[Middleware] Tenant resolution error details:', {
          host,
          pathname,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  // No Supabase cookie means no session to read or refresh. The access gates
  // below still run — an anonymous hit on /admin must still bounce to login —
  // they just do so without a round-trip to GoTrue.
  const shouldConsultSession = hasSupabaseCookie(request)

  // Track whether we have a rewrite so setAll can preserve it
  const rewriteUrl = supabaseResponse.headers.get('x-middleware-rewrite')

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Preserve the rewrite if one was set, otherwise create a plain next response
          if (rewriteUrl) {
            supabaseResponse = NextResponse.rewrite(new URL(rewriteUrl), { request })
          } else {
            supabaseResponse = NextResponse.next({ request })
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
      global: { fetch: createTimedFetch(AUTH_FETCH_TIMEOUT_MS) },
    }
  )

  // IMPORTANT: DO NOT REMOVE auth.getUser() — it is what refreshes an admin's
  // session cookie; Server Components cannot write cookies themselves.
  const user = shouldConsultSession ? await getSessionUser(supabase) : null

  // Public routes that don't require authentication
  // Use specific patterns to avoid matching admin paths like /tenant/admin/menu-engineering
  const isPublicRoute =
    (pathname.match(/^\/[^/]+\/menu(\/|$)/) && !pathname.match(/^\/[^/]+\/admin\//)) ||
    pathname === '/' ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/support') ||
    pathname.startsWith('/download') ||
    (/^\/[^/]+\/login(\/|$)/.test(pathname) && !pathname.includes('/admin/')) ||
    pathname === '/superadmin/mcp/authorize' ||
    pathname.startsWith('/superadmin/login')

  // Protect superadmin routes: require auth + role
  if (!user && isSuperAdminRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/superadmin/login'
    return NextResponse.redirect(url)
  }

  if (user && isSuperAdminRoute && !pathname.startsWith('/superadmin/login')) {
    // Verify superadmin role
    const { data: roleRow } = await supabase
      .from('app_users')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!roleRow || roleRow.role !== 'superadmin') {
      const url = request.nextUrl.clone()
      url.pathname = '/superadmin/login'
      url.searchParams.set('unauthorized', '1')
      return NextResponse.redirect(url)
    }
  }

  // Protect tenant admin routes - verify tenant ownership
  const tenantAdminMatch = pathname.match(/^\/([^/]+)\/admin/)
  if (tenantAdminMatch && !isPublicRoute) {
    const tenantSlug = tenantAdminMatch[1]
    const url = request.nextUrl.clone()

    // If not authenticated, redirect to tenant login
    if (!user) {
      url.pathname = `/${tenantSlug}/login`
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    // Verify user is admin of this specific tenant or superadmin.
    // Read through the resilient helper: it adds the branch column this gate
    // needs, and falls back to the pre-branch projection rather than 400ing
    // every admin page if the migration is not applied yet.
    const { appUser } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)
    const userRole: AppUserScopeRow | null = appUser

    // If superadmin, allow access to any tenant admin
    if (userRole?.role === 'superadmin') {
      return supabaseResponse
    }

    // For tenant admin, verify they own this tenant
    if (userRole?.role === 'admin') {
      // Get tenant by slug to compare IDs
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .eq('is_active', true)
        .maybeSingle()

      const tenantData = tenant as { id: string } | null

      if (tenantData && userRole.tenant_id === tenantData.id) {
        // Staff with restricted permissions may only open feature sections
        // they were granted; everything else bounces to the dashboard.
        const requiredPermission = permissionForAdminPath(pathname)
        if (requiredPermission && !hasPermission(userRole, requiredPermission)) {
          url.pathname = `/${tenantSlug}/admin`
          url.searchParams.set('denied', requiredPermission)
          return NextResponse.redirect(url)
        }
        // Sections that describe the whole store — the branch directory — are
        // closed to an account that runs one branch. The nav entry is hidden
        // too, but typing the URL must not be a way around it.
        if (isStoreWideAdminPath(pathname) && !canViewBranchDirectory(userRole)) {
          url.pathname = `/${tenantSlug}/admin`
          url.searchParams.set('denied', 'branches')
          return NextResponse.redirect(url)
        }
        return supabaseResponse
      }
    }

    // Unauthorized - not admin of this tenant
    url.pathname = `/${tenantSlug}/login`
    url.searchParams.set('unauthorized', '1')
    return NextResponse.redirect(url)
  }

  return supabaseResponse
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
