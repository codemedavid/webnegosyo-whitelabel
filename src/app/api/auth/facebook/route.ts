import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/**
 * GET /api/auth/facebook
 * Initiates Facebook OAuth flow
 * Redirects user to Facebook login with required scopes
 */
export async function GET(request: NextRequest) {
  const appId = process.env.FACEBOOK_APP_ID

  if (!appId) {
    return NextResponse.json(
      {
        error: 'Facebook OAuth not configured',
        message: 'FACEBOOK_APP_ID environment variable is missing. Please configure it in your .env.local file.'
      },
      { status: 500 }
    )
  }

  // Build redirect URI dynamically from request URL
  const protocol = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('host') || request.nextUrl.host
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${protocol}://${host}/api/auth/facebook/callback`

  // Get tenant_id from query params (should be passed from admin UI)
  const searchParams = request.nextUrl.searchParams
  const tenantId = searchParams.get('tenant_id')

  if (!tenantId) {
    return NextResponse.json(
      { error: 'tenant_id is required' },
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

  type AppUser = { role: string; tenant_id: string | null }
  const appUser = appUserData as AppUser | null
  if (!appUser || (appUser.role !== 'superadmin' && appUser.tenant_id !== tenantId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Generate tamper-proof CSRF state token with HMAC-SHA256 signature
  const stateSecret = process.env.FACEBOOK_STATE_SECRET
  if (!stateSecret) {
    return NextResponse.json(
      {
        error: 'Facebook OAuth not configured',
        message: 'FACEBOOK_STATE_SECRET environment variable is missing. Please configure it in your .env.local file.',
      },
      { status: 500 }
    )
  }

  // Generate cryptographically random nonce
  const nonce = crypto.randomBytes(16).toString('hex')
  const timestamp = Date.now()

  // Create state payload with tenant_id, nonce, and timestamp
  const statePayload = {
    tenant_id: tenantId,
    nonce,
    timestamp,
  }

  // Encode payload to base64
  const payloadBase64 = Buffer.from(JSON.stringify(statePayload)).toString('base64url')

  // Compute HMAC-SHA256 signature over the payload
  const signature = crypto
    .createHmac('sha256', stateSecret)
    .update(payloadBase64)
    .digest('base64url')

  // Combine payload and signature: payload.signature
  const state = `${payloadBase64}.${signature}`

  // Required scopes for page management and messaging
  const scopes = [
    'pages_show_list', // List user's pages
    'pages_messaging', // Send/receive messages
    'pages_manage_metadata', // Manage webhooks
  ].join(',')

  // Redirect to Facebook OAuth
  const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?` +
    `client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scopes}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code`

  return NextResponse.redirect(authUrl)
}

