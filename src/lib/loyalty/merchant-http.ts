// Shared request plumbing for merchant-authenticated loyalty routes: bounded
// body reads, non-cacheable responses, and bearer-session membership checks.
// Routes still decide the permission each action needs.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { PermissionHolder } from '@/lib/staff-permissions'

const MAX_BODY_BYTES = 16384
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MerchantMember = PermissionHolder & { tenant_id: string | null }
export type MerchantAuth =
  | { ok: true; userId: string; member: MerchantMember }
  | { ok: false; response: NextResponse }

export function respond(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function unavailable(message: string): NextResponse {
  return respond({ error: message }, 503)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** Only the listed keys may appear; every listed key must pass its check. */
export function hasExactKeys(
  value: unknown, checks: Record<string, (field: unknown) => boolean>,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const expected = Object.keys(checks)
  if (Object.keys(value).some(key => !expected.includes(key))) return false
  return expected.every(key => checks[key](value[key]))
}

/** Bounds the streamed bytes, not just the caller-controlled Content-Length. */
export async function readBody(request: NextRequest): Promise<unknown | NextResponse> {
  const reader = request.body?.getReader()
  if (!reader) return respond({ error: 'JSON body is required.' }, 400)
  let bytes = 0
  let text = ''
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel()
        return respond({ error: 'Request is too large.' }, 413)
      }
      text += decoder.decode(part.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } catch {
    return respond({ error: 'Invalid JSON body.' }, 400)
  } finally {
    reader.releaseLock()
  }
}

/** Resolves the bearer session to a merchant member of `tenantId` (or a superadmin). */
export async function authenticateMerchant(request: NextRequest, tenantId: string): Promise<MerchantAuth> {
  const authorization = request.headers.get('authorization')
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return denied(401, 'Unauthorized')
  const caller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: { user }, error: authError } = await caller.auth.getUser()
  if (authError || !user) return denied(401, 'Unauthorized')
  const { data: member, error: memberError } = await caller.from('app_users')
    .select('role, tenant_id, permissions, is_owner').eq('user_id', user.id).single()
  if (memberError || !member) return denied(403, 'Forbidden')
  const isMember = member.role === 'superadmin' || (member.role === 'admin' && member.tenant_id === tenantId)
  if (!isMember) return denied(403, 'Forbidden')
  return { ok: true, userId: user.id, member }
}

function denied(status: number, message: string): MerchantAuth {
  return { ok: false, response: respond({ error: message }, status) }
}
