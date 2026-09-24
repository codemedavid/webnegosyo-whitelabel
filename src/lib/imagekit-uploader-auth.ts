import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'

/**
 * Who is asking for ImageKit upload credentials.
 *
 * Accepts either credential the product actually has: the web admin's cookie
 * session, or the merchant app's Supabase access token as
 * `Authorization: Bearer <token>`. Only `app_users` admins and superadmins
 * qualify — the only roles that exist besides anonymous customers, whose
 * payment-proof uploads go through /api/payment-proof/upload instead.
 */

export interface ImageKitUploader {
  userId: string
  role: 'admin' | 'superadmin'
  tenantId: string | null
}

export type UploaderResolution =
  | { status: 'authorized'; uploader: ImageKitUploader }
  /** No credentials were presented at all. */
  | { status: 'anonymous' }
  /** Credentials were presented but are invalid or not an admin's. */
  | { status: 'denied' }

const AUTH_TIMEOUT_MS = 5_000
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i

interface AuthCapableClient {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }
  from: (table: 'app_users') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: { role?: string | null; tenant_id?: string | null } | null }>
      }
    }
  }
}

function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? ''
  return /(^|;\s*)sb-[^=]*-auth-token/.test(cookie)
}

async function resolveWith(client: AuthCapableClient): Promise<UploaderResolution> {
  const { data } = await client.auth.getUser()
  const user = data?.user
  if (!user) return { status: 'denied' }

  const { data: member } = await client
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = member?.role
  if (role !== 'admin' && role !== 'superadmin') return { status: 'denied' }

  return {
    status: 'authorized',
    uploader: { userId: user.id, role, tenantId: member?.tenant_id ?? null },
  }
}

function bearerClient(authorization: string): AuthCapableClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization }, fetch: createTimedFetch(AUTH_TIMEOUT_MS) },
    },
  ) as unknown as AuthCapableClient
}

/** Never throws: any failure to verify is `denied`, never `authorized`. */
export async function resolveImageKitUploader(request: Request): Promise<UploaderResolution> {
  try {
    const authorization = request.headers.get('authorization')?.trim() ?? ''
    if (authorization !== '') {
      if (!BEARER_PATTERN.test(authorization)) return { status: 'denied' }
      return await resolveWith(bearerClient(authorization))
    }

    const cookieClient = (await createCookieClient()) as unknown as AuthCapableClient
    const resolution = await resolveWith(cookieClient)
    if (resolution.status === 'denied' && !hasSessionCookie(request)) {
      return { status: 'anonymous' }
    }
    return resolution
  } catch (error) {
    console.error('[imagekit] uploader auth check failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { status: 'denied' }
  }
}
