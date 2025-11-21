import { NextRequest, NextResponse } from 'next/server'
import { unsubscribePageFromWebhook } from '@/lib/facebook-api'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type AppUser = Database['public']['Tables']['app_users']['Row']

/**
 * POST /api/auth/facebook/disconnect
 * Disconnects a Facebook Page from a tenant
 * Unsubscribes from webhook and removes connection
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenant_id, page_id } = body

    if (!tenant_id || !page_id) {
      return NextResponse.json(
        { error: 'tenant_id and page_id are required' },
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
    const { data: appUserData } = await supabase
      .from('app_users')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const appUser = appUserData as Pick<AppUser, 'role' | 'tenant_id'> | null
    if (!appUser || (appUser.role !== 'superadmin' && appUser.tenant_id !== tenant_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get page record
    const { data: pageRecordData } = await supabase
      .from('facebook_pages')
      .select('page_access_token')
      .eq('tenant_id', tenant_id)
      .eq('page_id', page_id)
      .single()

    const pageRecord = pageRecordData as { page_access_token: string } | null
    if (!pageRecord) {
      return NextResponse.json(
        { error: 'Page connection not found' },
        { status: 404 }
      )
    }

    // Unsubscribe page from webhook
    await unsubscribePageFromWebhook(page_id, pageRecord.page_access_token)

    // Get page database ID
    const { data: pageData } = await supabase
      .from('facebook_pages')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('page_id', page_id)
      .single()

    const page = pageData as { id: string } | null

    // Remove connection
    const { error: deleteError } = await supabase
      .from('facebook_pages')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('page_id', page_id)

    if (deleteError) {
      throw deleteError
    }

    // Clear tenant's facebook_page_id if it was this page
    if (page) {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('facebook_page_id')
        .eq('id', tenant_id)
        .single()

      const tenant = tenantData as { facebook_page_id: string | null } | null
      if (tenant && tenant.facebook_page_id === page.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('tenants')
          .update({ facebook_page_id: null })
          .eq('id', tenant_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Facebook Disconnect] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to disconnect page',
      },
      { status: 500 }
    )
  }
}

