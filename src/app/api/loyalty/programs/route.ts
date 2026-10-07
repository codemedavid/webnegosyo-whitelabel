import { NextRequest, NextResponse } from 'next/server'
import { readBody } from '@/lib/loyalty/merchant-http'
import { resolveProgramCatalog } from '@/lib/loyalty/program-catalog'
import { authorizeLoyaltyMerchant, readTenantId as tenantIdFrom } from '@/lib/loyalty/merchant-auth'
import { switchLoyaltyLive } from '@/lib/loyalty/go-live-write'

/**
 * /api/loyalty/programs — owner program management for the merchant app.
 *
 *   GET  ?tenantId=…           list programs with their current rules and counts
 *   POST { tenantId, action }  create | revise | set_status
 *
 * Authenticated with the caller's own access token, and the tenant is the
 * CALLER's tenant, never the body's claim alone — the same discipline as the
 * customer routes. On top of that, every call needs the `loyalty_manage` grant:
 * a program's rules and a customer's balance both move value, and the
 * `customers` grant that shows the guest list must not be enough to rewrite
 * everyone's stamp card.
 *
 * Adjusting ONE customer's balance lives on `/api/loyalty/members` instead.
 * It used to live here too, without an idempotency key and without the
 * threshold, so a double tap doubled a balance and a hand-completed card
 * minted nothing. One path, one set of rules.
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenantId = tenantIdFrom(request.nextUrl.searchParams.get('tenantId'))
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 })

  const caller = await authorizeLoyaltyMerchant(request, tenantId)
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
  const raw = await readBody(request)
  if (raw instanceof NextResponse) return raw
  const body = raw as Record<string, unknown> | null
  const tenantId = tenantIdFrom(body?.tenantId)
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 })

  const caller = await authorizeLoyaltyMerchant(request, tenantId)
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
        const catalog = await resolveProgramCatalog(admin, tenantId, parsed.value.rules)
        if ('error' in catalog) return NextResponse.json({ error: catalog.error }, { status: 400 })
        const created = await repo.createLoyaltyProgram(admin, tenantId, { ...parsed.value, rules: catalog.rules }, caller.userId)
        return NextResponse.json({ success: true, ...created })
      }
      case 'revise': {
        const programId = tenantIdFrom(body.programId)
        if (!programId) return NextResponse.json({ error: 'programId is required.' }, { status: 400 })
        const { parseLoyaltyRules } = await import('@/lib/loyalty/rules')
        const rules = parseLoyaltyRules(body.rules)
        if (!rules.ok) return NextResponse.json({ error: rules.error }, { status: 400 })
        if (body.expectedVersion !== null && (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 1)) {
          return NextResponse.json({ error: 'Reload the program before editing.' }, { status: 409 })
        }
        const catalog = await resolveProgramCatalog(admin, tenantId, rules.value)
        if ('error' in catalog) return NextResponse.json({ error: catalog.error }, { status: 400 })
        const revised = await repo.reviseLoyaltyProgram(admin, tenantId, programId, catalog.rules, caller.userId, body.expectedVersion as number | null)
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
        if (body.expectedStatus !== undefined && body.expectedStatus !== current.status) return NextResponse.json({ error: 'Program changed. Reload before editing.' }, { status: 409 })
        const patch = manage.programStatusPatch(current, to, new Date())
        if (!patch) {
          return NextResponse.json({ error: `A ${current.status} program cannot become ${to}.` }, { status: 409 })
        }
        await repo.writeLoyaltyProgramStatus(admin, tenantId, programId, patch, caller.userId, current.status)
        // Activating a programme is the merchant saying "go". Without this the
        // store stayed disabled and in shadow, the programme read "Live", and
        // not one customer ever saw a stamp.
        const isLive = patch.status === 'active' ? await switchLoyaltyLive(admin, tenantId) : false
        return NextResponse.json({ success: true, status: patch.status, wentLive: isLive })
      }
      default:
        return NextResponse.json({ error: 'action must be create, revise or set_status.' }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Loyalty request failed.'
    console.error('[loyalty/programs]', body?.action, message)
    const isConflict = /changed|ended|cannot change|Set reward rules|active branch/.test(message)
    return NextResponse.json({ error: isConflict ? message : 'Could not save the program. Please reload and try again.' }, { status: isConflict ? 409 : 503 })
  }
}
