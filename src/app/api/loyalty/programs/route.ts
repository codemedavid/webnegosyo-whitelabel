import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * /api/loyalty/programs — owner program management for the merchant app.
 *
 *   GET  ?tenantId=…           list programs with their current rules and counts
 *   POST { tenantId, action }  create | revise | set_status | correct_balance
 *
 * Authenticated with the caller's own access token, and the tenant is the
 * CALLER's tenant, never the body's claim alone — the same discipline as the
 * customer routes. On top of that, every call needs the `loyalty_manage` grant:
 * a program's rules and a customer's balance both move value, and the
 * `customers` grant that shows the guest list must not be enough to rewrite
 * everyone's stamp card.
 *
 * The write runs service-role because balance corrections go through
 * `apply_loyalty_earning`, which is granted to service_role alone. That is
 * deliberate: a balance can never change without a ledger row explaining it.
 */

interface Caller {
  userId: string
  tenantId: string
}

async function authorize(request: NextRequest, tenantId: string): Promise<Caller | NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: appUser } = await supabase
    .from('app_users')
    .select('role, tenant_id, permissions, is_owner')
    .eq('user_id', user.id)
    .single()

  const isTenantMember =
    appUser?.role === 'superadmin' || (appUser?.role === 'admin' && appUser.tenant_id === tenantId)
  if (!isTenantMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { hasPermission } = await import('@/lib/staff-permissions')
  const permitted = hasPermission(
    {
      role: appUser?.role ?? null,
      is_owner: appUser?.is_owner ?? false,
      permissions: (appUser?.permissions as string[] | null) ?? null,
    },
    'loyalty_manage',
  )
  if (!permitted) {
    return NextResponse.json({ error: 'Forbidden: loyalty_manage is required.' }, { status: 403 })
  }

  return { userId: user.id, tenantId }
}

function tenantIdFrom(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Bring the store's loyalty flags up to what an active programme needs.
 * Returns whether anything was written. Never throws: the programme is
 * already active, and a flag write that failed is retried by the next
 * activation rather than failing the one the merchant just made.
 */
async function goLive(
  admin: Awaited<ReturnType<typeof import('@/lib/supabase/admin')['createAdminClient']>>,
  tenantId: string,
): Promise<boolean> {
  try {
    const { loadLoyaltyTenantFlags } = await import('@/lib/loyalty/store')
    const { decideLoyaltyGoLive } = await import('@/lib/loyalty/go-live')
    const patch = decideLoyaltyGoLive(await loadLoyaltyTenantFlags(admin, tenantId))
    if (!patch) return false

    const { error } = await admin.from('tenants').update(patch).eq('id', tenantId)
    if (error) throw new Error(error.message)
    return true
  } catch (err) {
    console.error('[loyalty] could not switch the store live:', err instanceof Error ? err.message : err)
    return false
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenantId = tenantIdFrom(request.nextUrl.searchParams.get('tenantId'))
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 })

  const caller = await authorize(request, tenantId)
  if (caller instanceof NextResponse) return caller

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { listLoyaltyPrograms } = await import('@/lib/loyalty/repository')
  const admin = createAdminClient()

  const [{ data: tenant }, programs] = await Promise.all([
    admin.from('tenants').select('loyalty_enabled, loyalty_shadow').eq('id', tenantId).maybeSingle(),
    listLoyaltyPrograms(admin, tenantId),
  ])
  const flags = tenant as { loyalty_enabled?: boolean; loyalty_shadow?: boolean } | null

  return NextResponse.json({
    success: true,
    programs,
    loyalty: { isEnabled: flags?.loyalty_enabled === true, isShadow: flags?.loyalty_shadow !== false },
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const tenantId = tenantIdFrom(body?.tenantId)
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 })

  const caller = await authorize(request, tenantId)
  if (caller instanceof NextResponse) return caller

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const manage = await import('@/lib/loyalty/manage')
  const repo = await import('@/lib/loyalty/repository')
  const admin = createAdminClient()

  try {
    switch (body?.action) {
      case 'create': {
        const parsed = manage.parseLoyaltyProgramInput(body.program)
        if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
        const created = await repo.createLoyaltyProgram(admin, tenantId, parsed.value, caller.userId)
        return NextResponse.json({ success: true, ...created })
      }
      case 'revise': {
        const programId = tenantIdFrom(body.programId)
        if (!programId) return NextResponse.json({ error: 'programId is required.' }, { status: 400 })
        const { parseLoyaltyRules } = await import('@/lib/loyalty/rules')
        const rules = parseLoyaltyRules(body.rules)
        if (!rules.ok) return NextResponse.json({ error: rules.error }, { status: 400 })
        const revised = await repo.reviseLoyaltyProgram(admin, tenantId, programId, rules.value, caller.userId)
        return NextResponse.json({ success: true, ...revised })
      }
      case 'set_status': {
        const programId = tenantIdFrom(body.programId)
        const to = tenantIdFrom(body.status) as 'active' | 'paused' | 'ended'
        if (!programId || !['active', 'paused', 'ended'].includes(to)) {
          return NextResponse.json({ error: 'programId and a status of active, paused or ended are required.' }, { status: 400 })
        }
        const current = await repo.readLoyaltyProgramStatus(admin, tenantId, programId)
        if (!current) return NextResponse.json({ error: 'Program not found.' }, { status: 404 })
        const patch = manage.programStatusPatch(current, to, new Date())
        if (!patch) {
          return NextResponse.json({ error: `A ${current.status} program cannot become ${to}.` }, { status: 409 })
        }
        await repo.writeLoyaltyProgramStatus(admin, tenantId, programId, patch)
        // Activating a programme is the merchant saying "go". Without this the
        // store stayed disabled and in shadow, the programme read "Live", and
        // not one customer ever saw a stamp.
        const isLive = patch.status === 'active' ? await goLive(admin, tenantId) : false
        return NextResponse.json({ success: true, status: patch.status, wentLive: isLive })
      }
      case 'correct_balance': {
        const parsed = manage.parseBalanceCorrection(body.correction)
        if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
        const result = await repo.correctLoyaltyBalance(admin, tenantId, parsed.value, caller.userId)
        return NextResponse.json({ success: true, ...result })
      }
      default:
        return NextResponse.json({ error: 'action must be create, revise, set_status or correct_balance.' }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Loyalty request failed.'
    console.error('[loyalty/programs]', body?.action, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
