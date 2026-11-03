'use server'

import { createClient } from '@/lib/supabase/server'
import {
  getTenantPageByPageId,
  getTenantActivePageById,
} from '@/lib/facebook/page-tokens'
import { verifyTenantAdmin, verifyTenantPermission } from '@/lib/admin-service'

/**
 * Connecting, disconnecting and resubscribing a page — and reading the owner's
 * Facebook user token — are Settings work, gated exactly like the Facebook
 * management API routes. "Any staff of the store" let a POS-only account read
 * the owner's long-lived user token.
 */
const FACEBOOK_MANAGEMENT_PERMISSION = 'settings' as const

/**
 * Get connected Facebook pages for a tenant
 */
export async function getFacebookPagesAction(tenantId: string) {
  try {
    await verifyTenantAdmin(tenantId, 'view')

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

// Connecting a page is POST /api/auth/facebook/connect: it reads the page
// token from Facebook server-side. There is deliberately no server action that
// takes page or user tokens from the browser.

/**
 * Stop Meta delivering this Page's Messenger events to us. Best effort: a
 * token Facebook already revoked (the owner removed the app in Business
 * Integrations) cannot unsubscribe, and must not stop us forgetting it.
 */
async function unsubscribeBeforeDisconnect(pageId: string, pageAccessToken: string): Promise<void> {
  try {
    const { unsubscribePageFromWebhook } = await import('@/lib/facebook-api')
    const isUnsubscribed = await unsubscribePageFromWebhook(pageId, pageAccessToken)
    if (!isUnsubscribed) console.error('[Facebook Disconnect] Facebook did not confirm the unsubscribe', { pageId })
  } catch (error) {
    console.error('[Facebook Disconnect] Unsubscribe failed; forgetting the token anyway', {
      pageId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Disconnect a Facebook page from a tenant: unsubscribe our app from the Page,
 * then delete the stored page token, the owner's user token, and any
 * half-finished connection (`temp_*` rows) that still holds one. The privacy
 * policy and /data-deletion promise exactly this.
 */
export async function disconnectFacebookPageAction(tenantId: string, pageId: string) {
  try {
    await verifyTenantPermission(tenantId, FACEBOOK_MANAGEMENT_PERMISSION)

    const supabase = await createClient()

    // Get page record
    const pageData = await getTenantPageByPageId(tenantId, pageId)

    const page = pageData as { id: string; page_access_token: string } | null
    if (!page) {
      return { success: false, error: 'Page connection not found' }
    }

    await unsubscribeBeforeDisconnect(pageId, page.page_access_token)

    // Remove connection
    const { error: deleteError } = await supabase
      .from('facebook_pages')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('page_id', pageId)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // A sign-in that never finished choosing a Page leaves a `temp_*` row
    // holding the owner's user token. Real Page ids are numeric.
    const { error: tempDeleteError } = await supabase
      .from('facebook_pages')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('is_active', false)
      .like('page_id', 'temp_%')

    if (tempDeleteError) {
      console.error('[Facebook Disconnect] Could not clear unfinished connections', { tenantId, error: tempDeleteError.message })
    }

    // Clear tenant's facebook_page_id if it was this page
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('facebook_page_id')
      .eq('id', tenantId)
      .single()

    const tenant = tenantData as { facebook_page_id: string | null } | null
    if (tenant && tenant.facebook_page_id === page.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ((supabase as any)
        .from('tenants')
        .update({ facebook_page_id: null })
        .eq('id', tenantId))
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
 * Manually subscribe a page to webhook (for troubleshooting)
 */
export async function subscribePageToWebhookAction(
  tenantId: string,
  pageId: string
) {
  try {
    await verifyTenantPermission(tenantId, FACEBOOK_MANAGEMENT_PERMISSION)

    const pageData = await getTenantActivePageById(tenantId, pageId)

    const page = pageData as { page_id: string; page_access_token: string } | null
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
    await verifyTenantAdmin(tenantId, 'view')

    const pageData = await getTenantActivePageById(tenantId, pageId)

    const page = pageData as { page_id: string; page_access_token: string } | null
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

