import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  decideSuperadminConsent,
  isValidSuperadminAuthorizationId,
} from '@/lib/mcp/superadmin-consent'
import { resolveSmartMenuSiteOrigin } from '@/lib/mcp/connect-url'

export async function POST(request: Request): Promise<Response> {
  const trustedOrigin = resolveSmartMenuSiteOrigin({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    PLATFORM_ROOT_DOMAIN: process.env.PLATFORM_ROOT_DOMAIN,
  })
  if (request.headers.get('origin') !== trustedOrigin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const form = await request.formData()
  const authorizationId = form.get('authorization_id')
  const rawDecision = form.get('decision')

  if (
    typeof authorizationId !== 'string'
    || !isValidSuperadminAuthorizationId(authorizationId)
    || (rawDecision !== 'approve' && rawDecision !== 'deny')
  ) {
    return Response.json({ error: 'Invalid authorization decision.' }, { status: 400 })
  }

  const result = await decideSuperadminConsent(
    await createClient(),
    authorizationId,
    rawDecision,
  )

  if (result.kind === 'forbidden') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (result.kind === 'error') {
    return Response.json({ error: result.message }, { status: 400 })
  }

  return NextResponse.redirect(result.href, 303)
}
