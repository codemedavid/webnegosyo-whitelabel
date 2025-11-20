import { NextRequest, NextResponse } from 'next/server'
import { subscribePageToWebhook } from '@/lib/facebook-api'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/auth/facebook/connect
 * Connects a Facebook Page to a tenant
 * Stores page info, subscribes to webhook, updates tenant reference
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenant_id, page_id, page_name, page_access_token, user_access_token, temp_id } = body

    if (!tenant_id || !page_id || !page_name || !page_access_token || !user_access_token || !temp_id) {
      return NextResponse.json(
        { error: 'tenant_id, page_id, page_name, page_access_token, user_access_token, and temp_id are required' },
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

    const userData = appUser as { role: string; tenant_id: string } | null
    if (!userData || (userData.role !== 'superadmin' && userData.tenant_id !== tenant_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify temporary record exists (for security)
    const { data: tempRecord } = await supabase
      .from('facebook_pages')
      .select('id')
      .eq('id', temp_id)
      .eq('tenant_id', tenant_id)
      .single()

    if (!tempRecord) {
      return NextResponse.json(
        { error: 'Temporary record not found or expired' },
        { status: 404 }
      )
    }

    // Use provided page data (already validated in client)
    const selectedPage = {
      id: page_id,
      name: page_name,
      access_token: page_access_token,
    }

    // Check if page is already connected
    const { data: existingPage } = await supabase
      .from('facebook_pages')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('page_id', page_id)
      .maybeSingle()

    const existingPageData = existingPage as { id: string } | null
    if (existingPageData) {
      // Update existing connection
      const { error: updateError } = await supabase
        .from('facebook_pages')
        .update({
          page_name: selectedPage.name,
          page_access_token: selectedPage.access_token,
          user_access_token: user_access_token,
          is_active: true,
          updated_at: new Date().toISOString(),
        } as unknown as never)
        .eq('id', existingPageData.id)

      if (updateError) {
        throw updateError
      }

      // Subscribe page to webhook
      const subscribeResult = await subscribePageToWebhook(page_id, selectedPage.access_token)
      if (!subscribeResult.success) {
        console.error(`[Connect] Failed to subscribe page to webhook: ${subscribeResult.error}`)
        // Continue anyway - user can manually subscribe later
      }

      // Update tenant's facebook_page_id if not set
      const { data: tenant } = await supabase
        .from('tenants')
        .select('facebook_page_id')
        .eq('id', tenant_id)
        .single()

      const tenantData = tenant as { facebook_page_id?: string | null } | null
      if (tenantData && !tenantData.facebook_page_id) {
        await supabase
          .from('tenants')
          .update({ facebook_page_id: existingPageData.id } as unknown as never)
          .eq('id', tenant_id)
      }

      // Delete temporary record
      await supabase.from('facebook_pages').delete().eq('id', temp_id)

      return NextResponse.json({ success: true, page_id: existingPageData.id })
    }

    // Create new connection
    const { data: newPage, error: insertError } = await supabase
      .from('facebook_pages')
      .insert({
        tenant_id,
        page_id,
        page_name: selectedPage.name,
        page_access_token: selectedPage.access_token,
        user_access_token: user_access_token,
        is_active: true,
      } as unknown as never)
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    const newPageData = newPage as { id: string } | null
    if (!newPageData) {
      throw new Error('Failed to create page connection')
    }

    // Subscribe page to webhook
    const subscribeResult = await subscribePageToWebhook(page_id, selectedPage.access_token)
    if (!subscribeResult.success) {
      console.error(`[Connect] Failed to subscribe page to webhook: ${subscribeResult.error}`)
      // Continue anyway - user can manually subscribe later
    }

    // Update tenant's facebook_page_id if not set
    const { data: tenant } = await supabase
      .from('tenants')
      .select('facebook_page_id')
      .eq('id', tenant_id)
      .single()

    const tenantData = tenant as { facebook_page_id?: string | null } | null
    if (tenantData && !tenantData.facebook_page_id) {
      await supabase
        .from('tenants')
        .update({ facebook_page_id: newPageData.id } as unknown as never)
        .eq('id', tenant_id)
    }

    // Delete temporary record
    await supabase.from('facebook_pages').delete().eq('id', temp_id)

    return NextResponse.json({ success: true, page_id: newPageData.id })
  } catch (error) {
    console.error('[Facebook Connect] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to connect page',
      },
      { status: 500 }
    )
  }
}

