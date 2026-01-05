import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken, getLongLivedToken } from '@/lib/facebook-api'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/**
 * GET /api/auth/facebook/callback
 * Handles Facebook OAuth callback
 * Exchanges code for token, fetches user's pages, stores in session
 * Redirects to page selection UI
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Handle OAuth errors
  if (error) {
    const errorDescription = searchParams.get('error_description') || error
    return NextResponse.redirect(
      new URL(`/error?message=${encodeURIComponent(errorDescription)}`, request.url)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/error?message=Missing code or state parameter', request.url)
    )
  }

  try {
    // Verify state secret is configured
    const stateSecret = process.env.FACEBOOK_STATE_SECRET
    if (!stateSecret) {
      return NextResponse.redirect(
        new URL('/error?message=Server configuration error', request.url)
      )
    }

    // Parse state: payload.signature format
    const stateParts = state.split('.')
    if (stateParts.length !== 2) {
      return NextResponse.redirect(
        new URL('/error?message=Invalid state format', request.url)
      )
    }

    const [payloadBase64, receivedSignature] = stateParts

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', stateSecret)
      .update(payloadBase64)
      .digest('base64url')

    // Use timing-safe comparison to prevent timing attacks
    if (
      receivedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      )
    ) {
      console.error('[Facebook OAuth] Invalid state signature')
      return NextResponse.redirect(
        new URL('/error?message=Invalid state signature', request.url)
      )
    }

    // Decode and parse payload
    const stateData = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString())
    const { tenant_id: tenantId, timestamp, nonce } = stateData

    if (!tenantId || !timestamp || !nonce) {
      return NextResponse.redirect(
        new URL('/error?message=Invalid state payload', request.url)
      )
    }

    // Verify timestamp is within allowed window (10 minutes)
    const STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes
    const now = Date.now()
    if (now - timestamp > STATE_MAX_AGE_MS) {
      console.error('[Facebook OAuth] State token expired', {
        timestamp,
        now,
        age: now - timestamp,
      })
      return NextResponse.redirect(
        new URL('/error?message=OAuth session expired, please try again', request.url)
      )
    }

    // Verify user is admin of this tenant
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        new URL('/error?message=Unauthorized', request.url)
      )
    }

    // Check if user is admin of this tenant
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const userData = appUser as { role: string; tenant_id: string } | null
    if (!userData || (userData.role !== 'superadmin' && userData.tenant_id !== tenantId)) {
      return NextResponse.redirect(
        new URL('/error?message=Forbidden', request.url)
      )
    }

    // Exchange code for short-lived token
    // Build redirect URI dynamically from request URL (must match what was used in OAuth initiation)
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host') || request.nextUrl.host
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${protocol}://${host}/api/auth/facebook/callback`

    const shortLivedToken = await exchangeCodeForToken(code, redirectUri)

    // Build base URL for redirects (use same protocol/host logic)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

    // Exchange for long-lived token (60 days)
    const longLivedTokenData = await getLongLivedToken(shortLivedToken)

    // Get tenant slug for redirect
    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      throw new Error('Tenant not found')
    }

    const tenantData = tenant as { slug: string }

    // Store token and pages temporarily in database with expiration
    // Create a temporary record that will be used by the page selection UI
    const { data: tempRecord } = await supabase
      .from('facebook_pages')
      .insert({
        tenant_id: tenantId,
        page_id: `temp_${Date.now()}`, // Temporary ID
        page_name: 'TEMP_SELECTION',
        page_access_token: 'TEMP',
        user_access_token: longLivedTokenData.access_token,
        is_active: false,
      } as unknown as never)
      .select()
      .single()

    const tempRecordData = tempRecord as { id: string } | null

    // Redirect to settings page with selection mode
    // The UI will fetch pages using the stored token
    // Use baseUrl to ensure we redirect to the correct domain (not localhost)
    const redirectUrl = new URL(`/${tenantData.slug}/admin/settings`, baseUrl)
    redirectUrl.searchParams.set('facebook_connect', 'true')
    redirectUrl.searchParams.set('temp_id', tempRecordData?.id || '')

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error('[Facebook OAuth] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.redirect(
      new URL(`/error?message=${encodeURIComponent(errorMessage)}`, request.url)
    )
  }
}
