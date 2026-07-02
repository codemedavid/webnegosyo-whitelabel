import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

/**
 * POST /api/revalidate-menu
 *
 * The webnegosyo-app mobile admin writes menu_items/categories directly to
 * Supabase, bypassing this app's ISR revalidation. Mobile calls this route
 * after a successful write so the public menu reflects the change immediately
 * instead of waiting out the ISR TTL. Authenticated via the caller's own
 * Supabase access token — same trust level as `verifyTenantAdmin` in
 * `src/lib/admin-service.ts`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null)
  const tenantId = body?.tenantId
  const tenantSlug = body?.tenantSlug

  if (!tenantId || !tenantSlug) {
    return NextResponse.json(
      { error: 'tenantId and tenantSlug are required' },
      { status: 400 },
    )
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: appUser } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .single()

  const isAuthorized =
    appUser?.role === 'superadmin' ||
    (appUser?.role === 'admin' && appUser.tenant_id === tenantId)

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  revalidatePath(`/${tenantSlug}/menu`)
  revalidatePath(`/${tenantSlug}/menu/item/[itemId]`, 'page')

  return NextResponse.json({ success: true })
}
