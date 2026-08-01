/**
 * The only place a Facebook access token is read out of the database.
 *
 * `page_access_token` can post as a merchant's page and read their
 * conversations, and `user_access_token` can enumerate their pages. Both used
 * to be fetched through the SSR client, which runs as `anon` on an
 * unauthenticated request such as the Facebook webhook — so the `anon` role had
 * to hold SELECT on `facebook_pages`, and the anon key ships in the browser
 * bundle.
 *
 * Every read moves here, onto the service-role client, so that grant can be
 * revoked. Centralised rather than switched client-by-client at each call site
 * so there is one file to audit, and so a new caller inherits the right client
 * instead of choosing one.
 *
 * The service role bypasses RLS, so scoping is this module's responsibility.
 * Every function below narrows to a single page the caller has already
 * identified, and the tenant-scoped variants keep their `tenant_id` filter —
 * without it, naming another merchant's page id would hand back their token.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface PageToken {
  page_id: string
  page_access_token: string
}

export interface PageOwnerToken {
  tenant_id: string
  page_access_token: string
}

/** Resolve an active page by its Facebook page id. Used by the webhook, which
 *  is told only which page was messaged. */
export async function getActivePageByPageId(
  pageId: string,
): Promise<PageOwnerToken | null> {
  const { data } = await createAdminClient()
    .from('facebook_pages')
    .select('tenant_id, page_access_token')
    .eq('page_id', pageId)
    .eq('is_active', true)
    .single()

  return (data as PageOwnerToken | null) ?? null
}

/** Resolve an active page by its row id, as stored on `tenants.facebook_page_id`. */
export async function getActivePageById(id: string): Promise<PageToken | null> {
  const { data } = await createAdminClient()
    .from('facebook_pages')
    .select('page_id, page_access_token')
    .eq('id', id)
    .eq('is_active', true)
    .single()

  return (data as PageToken | null) ?? null
}

/** Resolve a page the given tenant owns. The `tenant_id` filter is what stops
 *  one merchant reading another's token by naming their page id. */
export async function getTenantPageByPageId(
  tenantId: string,
  pageId: string,
): Promise<{ id: string; page_access_token: string } | null> {
  const { data } = await createAdminClient()
    .from('facebook_pages')
    .select('id, page_access_token')
    .eq('tenant_id', tenantId)
    .eq('page_id', pageId)
    .single()

  return (data as { id: string; page_access_token: string } | null) ?? null
}

/** Resolve an active page the given tenant owns, by row id. */
export async function getTenantActivePageById(
  tenantId: string,
  id: string,
): Promise<PageToken | null> {
  const { data } = await createAdminClient()
    .from('facebook_pages')
    .select('page_id, page_access_token')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('is_active', true)
    .single()

  return (data as PageToken | null) ?? null
}

/** The long-lived user token held on the temporary row written during OAuth,
 *  used to list the pages a merchant can connect. */
export async function getTenantUserAccessToken(
  tenantId: string,
  id: string,
): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('facebook_pages')
    .select('user_access_token')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  return (data as { user_access_token: string | null } | null)?.user_access_token ?? null
}
