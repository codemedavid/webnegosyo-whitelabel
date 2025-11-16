import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveTenantSlugFromRequest } from '@/lib/tenant'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const { pathname, search } = request.nextUrl

  // Skip all middleware processing for webhook routes (Facebook webhooks don't need auth/tenant resolution)
  if (pathname.startsWith('/api/messenger/webhook')) {
    return supabaseResponse
  }

  // Skip tenant resolution for superadmin routes
  const isSuperAdminRoute = pathname.startsWith('/superadmin')

  // Resolve tenant slug from custom domain or subdomain, and rewrite to path-based route
  // Priority: 1) Custom domain, 2) Subdomain, 3) Path-based routing
  // This keeps app routes unified under /[tenant] while supporting both custom domains and subdomains
  if (!isSuperAdminRoute) {
    const tenantSlug = await resolveTenantSlugFromRequest(request)

    // If tenant detected (custom domain or subdomain) and current path isn't already /[tenant]/...
    if (tenantSlug && !pathname.startsWith(`/${tenantSlug}/`) && pathname !== '/_next/image') {
      const rewrittenUrl = request.nextUrl.clone()
      // Redirect tenant root to tenant menu
      const targetPath = pathname === '/' ? `/${tenantSlug}/menu` : `/${tenantSlug}${pathname}`
      rewrittenUrl.pathname = targetPath
      // Maintain query string
      rewrittenUrl.search = search
      supabaseResponse = NextResponse.rewrite(rewrittenUrl)
    }
  }

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
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: DO NOT REMOVE auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Public routes that don't require authentication
  const isPublicRoute =
    pathname.includes('/menu') ||
    pathname === '/' ||
    pathname.includes('/login') ||
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

  // Protect tenant admin routes (basic auth check only for now)
  if (
    !user &&
    !isPublicRoute &&
    pathname.includes('/admin')
  ) {
    // Extract tenant slug from pathname like /tenant-name/admin/...
    const tenantMatch = pathname.match(/^\/([^/]+)\/admin/)
    if (tenantMatch) {
      const tenantSlug = tenantMatch[1]
      const url = request.nextUrl.clone()
      url.pathname = `/${tenantSlug}/login`
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

