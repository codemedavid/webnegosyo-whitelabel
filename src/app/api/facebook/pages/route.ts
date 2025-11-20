import { NextRequest, NextResponse } from 'next/server'
import { getUserPages } from '@/lib/facebook-api'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/facebook/pages
 * Fetches user's Facebook pages using a temporary user token
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const tenantId = searchParams.get('tenant_id')
    const tempId = searchParams.get('temp_id')

    if (!tenantId || !tempId) {
      return NextResponse.json(
        { error: 'tenant_id and temp_id are required' },
        { status: 400 }
      )
    }

    // Verify user is admin of this tenant
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin of this tenant
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!appUser || (appUser.role !== 'superadmin' && appUser.tenant_id !== tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get temporary record with user token
    const { data: tempRecord } = await supabase
      .from('facebook_pages')
      .select('user_access_token')
      .eq('id', tempId)
      .eq('tenant_id', tenantId)
      .single()

    if (!tempRecord || !tempRecord.user_access_token) {
      return NextResponse.json(
        { error: 'Temporary record not found or expired' },
        { status: 404 }
      )
    }

    // Fetch user's pages
    const pages = await getUserPages(tempRecord.user_access_token)

    return NextResponse.json({ success: true, data: pages })
  } catch (error) {
    console.error('[Facebook Pages API] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch pages',
      },
      { status: 500 }
    )
  }
}

