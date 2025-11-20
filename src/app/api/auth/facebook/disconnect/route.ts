import { NextRequest, NextResponse } from 'next/server'
import { unsubscribePageFromWebhook } from '@/lib/facebook-api'
import { createClient } from '@/lib/supabase/server'

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
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!appUser || (appUser.role !== 'superadmin' && appUser.tenant_id !== tenant_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get page record
    const { data: pageRecord } = await supabase
      .from('facebook_pages')
      .select('page_access_token')
      .eq('tenant_id', tenant_id)
      .eq('page_id', page_id)
      .single()

    if (!pageRecord) {
      return NextResponse.json(
        { error: 'Page connection not found' },
        { status: 404 }
      )
    }

    // Unsubscribe page from webhook
    await unsubscribePageFromWebhook(page_id, pageRecord.page_access_token)

    // Get page database ID
    const { data: page } = await supabase
      .from('facebook_pages')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('page_id', page_id)
      .single()

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
      const { data: tenant } = await supabase
        .from('tenants')
        .select('facebook_page_id')
        .eq('id', tenant_id)
        .single()

      if (tenant && tenant.facebook_page_id === page.id) {
        await supabase
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

