import { NextRequest, NextResponse } from 'next/server'
import { getUserPages, subscribePageToWebhook } from '@/lib/facebook-api'
import { createClient } from '@/lib/supabase/server'
import { canManageFacebook } from '@/lib/facebook/management-access'
import { getTenantUserAccessToken } from '@/lib/facebook/page-tokens'

type SessionClient = Awaited<ReturnType<typeof createClient>>

interface VerifiedPage {
  id: string
  name: string
  access_token: string
}

/** Postgres unique_violation: the page is active on another store (one active row per page_id). */
const UNIQUE_VIOLATION = '23505'
const ALREADY_CONNECTED_MESSAGE =
  'This Facebook page is already connected to another store. Disconnect it there first.'

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION
}

function alreadyConnectedResponse() {
  return NextResponse.json({ error: ALREADY_CONNECTED_MESSAGE }, { status: 409 })
}

async function subscribeOrLog(page: VerifiedPage) {
  const subscribeResult = await subscribePageToWebhook(page.id, page.access_token)
  if (!subscribeResult.success) {
    console.error(`[Connect] Failed to subscribe page to webhook: ${subscribeResult.error}`)
    // Continue anyway - user can manually subscribe later
  }
}

/** Point the tenant at this page row when it has none yet. */
async function linkTenantIfUnset(supabase: SessionClient, tenantId: string, pageRowId: string) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('facebook_page_id')
    .eq('id', tenantId)
    .single()

  const tenantData = tenant as { facebook_page_id?: string | null } | null
  if (tenantData && !tenantData.facebook_page_id) {
    await supabase
      .from('tenants')
      .update({ facebook_page_id: pageRowId } as unknown as never)
      .eq('id', tenantId)
  }
}

/**
 * The page the OAuth user really manages, read from Facebook with the user
 * token held on the temp row. Never trust page names or tokens from the body:
 * a forged token would bind someone else's page id to this store.
 */
async function resolveVerifiedPage(
  tenantId: string,
  tempId: string,
  pageId: string,
): Promise<{ page: VerifiedPage; userAccessToken: string } | NextResponse> {
  // Filtered on tenant_id as well as the row id, so another store's temp row reads as missing.
  const userAccessToken = await getTenantUserAccessToken(tenantId, tempId)
  if (!userAccessToken) {
    return NextResponse.json({ error: 'Temporary record not found or expired' }, { status: 404 })
  }

  const pages = await getUserPages(userAccessToken)
  const page = pages.find((candidate) => candidate.id === pageId)
  if (!page || !page.access_token) {
    return NextResponse.json(
      { error: 'That page is not one your Facebook account manages. Please connect again.' },
      { status: 403 },
    )
  }

  return { page: { id: page.id, name: page.name, access_token: page.access_token }, userAccessToken }
}

/**
 * POST /api/auth/facebook/connect
 * Connects a Facebook Page to a tenant. Body: { tenant_id, page_id, temp_id }.
 * Stores page info, subscribes to webhook, updates tenant reference.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenant_id, page_id, temp_id } = (body ?? {}) as Record<string, unknown>

    if (typeof tenant_id !== 'string' || typeof page_id !== 'string' || typeof temp_id !== 'string'
      || !tenant_id || !page_id || !temp_id) {
      return NextResponse.json({ error: 'tenant_id, page_id and temp_id are required' }, { status: 400 })
    }

    // Verify user is admin of this tenant
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: appUser } = await supabase
      .from('app_users')
      .select('role, tenant_id, is_owner, permissions')
      .eq('user_id', user.id)
      .maybeSingle()

    const userData = appUser as { role: string; tenant_id: string | null; is_owner?: boolean; permissions?: string[] | null } | null
    if (!canManageFacebook(userData, tenant_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const verified = await resolveVerifiedPage(tenant_id, temp_id, page_id)
    if (verified instanceof NextResponse) return verified
    const { page: selectedPage, userAccessToken } = verified

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
          user_access_token: userAccessToken,
          is_active: true,
          updated_at: new Date().toISOString(),
        } as unknown as never)
        .eq('id', existingPageData.id)

      if (isUniqueViolation(updateError)) return alreadyConnectedResponse()
      if (updateError) {
        throw updateError
      }

      await subscribeOrLog(selectedPage)
      await linkTenantIfUnset(supabase, tenant_id, existingPageData.id)

      // Delete temporary record only if it's different from the existing page
      if (temp_id !== existingPageData.id) {
        await supabase.from('facebook_pages').delete().eq('id', temp_id)
      }

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
        user_access_token: userAccessToken,
        is_active: true,
      } as unknown as never)
      .select()
      .single()

    if (isUniqueViolation(insertError)) return alreadyConnectedResponse()
    if (insertError) {
      throw insertError
    }

    const newPageData = newPage as { id: string } | null
    if (!newPageData) {
      throw new Error('Failed to create page connection')
    }

    await subscribeOrLog(selectedPage)
    await linkTenantIfUnset(supabase, tenant_id, newPageData.id)

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
