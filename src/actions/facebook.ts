'use server'

import { createClient } from '@/lib/supabase/server'
import { verifyTenantAdmin } from '@/lib/admin-service'
import type { Database } from '@/types/database'

type FacebookPagesRow = Database['public']['Tables']['facebook_pages']['Row']
type FacebookPagesInsert = Database['public']['Tables']['facebook_pages']['Insert']
type FacebookPagesUpdate = Database['public']['Tables']['facebook_pages']['Update']

/**
 * Get connected Facebook pages for a tenant
 */
export async function getFacebookPagesAction(tenantId: string) {
  try {
    await verifyTenantAdmin(tenantId)

    const supabase = await createClient()
    const { data: pages, error } = await ((supabase
      .from('facebook_pages')
      .select('id, page_id, page_name, is_active, created_at')
      .eq('tenant_id', tenantId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order('created_at', { ascending: false })) as any)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: pages || [] }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get Facebook pages',
    }
  }
}

/**
 * Connect a Facebook page to a tenant
 * Called after user selects a page from OAuth flow
 */
export async function connectFacebookPageAction(
  tenantId: string,
  pageId: string,
  pageName: string,
  pageAccessToken: string,
  userAccessToken: string,
  tempId: string
) {
  try {
    await verifyTenantAdmin(tenantId)

    const supabase = await createClient()

    // Check if page is already connected
    const { data: existingPage } = await ((supabase
      .from('facebook_pages')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('page_id', pageId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .maybeSingle()) as any) as { data: { id: string } | null; error: unknown }

    if (existingPage) {
      // Update existing connection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('facebook_pages')
        .update({
          page_name: pageName,
          page_access_token: pageAccessToken,
          user_access_token: userAccessToken,
          is_active: true,
        } as FacebookPagesUpdate)
        .eq('id', existingPage.id)

      if (updateError) {
        return { success: false, error: updateError.message }
      }

      // Update tenant's facebook_page_id if not set
      const { data: tenant } = await ((supabase
        .from('tenants')
        .select('facebook_page_id')
        .eq('id', tenantId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .single()) as any) as { data: { facebook_page_id: string | null } | null }

      if (tenant && !tenant.facebook_page_id) {
        await ((supabase
          .from('tenants')
          .update({ facebook_page_id: existingPage.id })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq('id', tenantId)) as any)
      }

      // Delete temporary record
      if (tempId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('facebook_pages').delete().eq('id', tempId) as any)
      }

      return { success: true, data: { page_id: existingPage.id } }
    }

    // Create new connection
    const { data: newPage, error: insertError } = await ((supabase
      .from('facebook_pages')
      .insert({
        tenant_id: tenantId,
        page_id: pageId,
        page_name: pageName,
        page_access_token: pageAccessToken,
        user_access_token: userAccessToken,
        is_active: true,
      } as FacebookPagesInsert)
      .select()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single()) as any) as { data: FacebookPagesRow | null; error: unknown }

    if (insertError) {
      return { success: false, error: insertError.message }
    }

    // Update tenant's facebook_page_id if not set
    const { data: tenant } = await supabase
      .from('tenants')
      .select('facebook_page_id')
      .eq('id', tenantId)
      .single()

    if (tenant && !tenant.facebook_page_id) {
      await supabase
        .from('tenants')
        .update({ facebook_page_id: newPage.id })
        .eq('id', tenantId)
    }

    // Delete temporary record
    if (tempId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('facebook_pages').delete().eq('id', tempId) as any)
    }

    return { success: true, data: { page_id: newPage.id } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect Facebook page',
    }
  }
}

/**
 * Disconnect a Facebook page from a tenant
 */
export async function disconnectFacebookPageAction(tenantId: string, pageId: string) {
  try {
    await verifyTenantAdmin(tenantId)

    const supabase = await createClient()

    // Get page record
    const { data: page } = await ((supabase
      .from('facebook_pages')
      .select('id, page_access_token')
      .eq('tenant_id', tenantId)
      .eq('page_id', pageId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single()) as any) as { data: { id: string; page_access_token: string } | null }

    if (!page) {
      return { success: false, error: 'Page connection not found' }
    }

    // Remove connection
    const { error: deleteError } = await ((supabase
      .from('facebook_pages')
      .delete()
      .eq('tenant_id', tenantId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('page_id', pageId)) as any)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Clear tenant's facebook_page_id if it was this page
    const { data: tenant } = await ((supabase
      .from('tenants')
      .select('facebook_page_id')
      .eq('id', tenantId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single()) as any) as { data: { facebook_page_id: string | null } | null }

    if (tenant && tenant.facebook_page_id === page.id) {
      await ((supabase
        .from('tenants')
        .update({ facebook_page_id: null })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq('id', tenantId)) as any)
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to disconnect Facebook page',
    }
  }
}

/**
 * Get temporary user token for fetching pages
 * Used during OAuth callback to fetch user's pages
 */
export async function getTempUserTokenAction(tenantId: string, tempId: string) {
  try {
    await verifyTenantAdmin(tenantId)

    const supabase = await createClient()
    const { data: tempRecord } = await ((supabase
      .from('facebook_pages')
      .select('user_access_token')
      .eq('id', tempId)
      .eq('tenant_id', tenantId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single()) as any) as { data: { user_access_token: string | null } | null }

    if (!tempRecord || !tempRecord.user_access_token) {
      return { success: false, error: 'Temporary record not found or expired' }
    }

    return { success: true, data: { user_access_token: tempRecord.user_access_token } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get temporary token',
    }
  }
}

/**
 * Manually subscribe a page to webhook (for troubleshooting)
 */
export async function subscribePageToWebhookAction(
  tenantId: string,
  pageId: string
) {
  try {
    await verifyTenantAdmin(tenantId)

    const supabase = await createClient()
    const { data: page } = await ((supabase
      .from('facebook_pages')
      .select('page_id, page_access_token')
      .eq('tenant_id', tenantId)
      .eq('id', pageId)
      .eq('is_active', true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single()) as any) as { data: { page_id: string; page_access_token: string } | null }

    if (!page) {
      return { success: false, error: 'Page connection not found' }
    }

    const { subscribePageToWebhook } = await import('@/lib/facebook-api').then((m) => ({ subscribePageToWebhook: m.subscribePageToWebhook }))
    const result = await subscribePageToWebhook(
      page.page_id,
      page.page_access_token
    )

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to subscribe page to webhook' }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to subscribe page to webhook',
    }
  }
}

/**
 * Verify webhook subscription status for a page
 */
export async function verifyWebhookSubscriptionAction(
  tenantId: string,
  pageId: string
) {
  try {
    await verifyTenantAdmin(tenantId)

    const supabase = await createClient()
    const { data: page } = await ((supabase
      .from('facebook_pages')
      .select('page_id, page_access_token')
      .eq('tenant_id', tenantId)
      .eq('id', pageId)
      .eq('is_active', true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single()) as any) as { data: { page_id: string; page_access_token: string } | null }

    if (!page) {
      return { success: false, error: 'Page connection not found' }
    }

    const { verifyPageWebhookSubscription } = await import('@/lib/facebook-api').then((m) => ({ verifyPageWebhookSubscription: m.verifyPageWebhookSubscription }))
    const result = await verifyPageWebhookSubscription(
      page.page_id,
      page.page_access_token
    )

    return {
      success: true,
      data: {
        subscribed: result.subscribed,
        subscribedFields: result.subscribedFields || [],
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify webhook subscription',
    }
  }
}

