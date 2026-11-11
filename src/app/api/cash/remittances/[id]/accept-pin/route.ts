import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { acceptRemittanceByPin } from '@/lib/cash/remittance-pin'
import { MAX_REMITTANCE_CENTS, REMITTANCE_NOTE_MAX } from '@/lib/cash/remittances'
import { withRequestBearer } from '@/lib/supabase/bearer-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

const bodySchema = z
  .object({
    receiverUserId: z.string().uuid(),
    pin: z.string().regex(/^\d{4,6}$/, 'A PIN is 4 to 6 digits.'),
    receivedCents: z.number().int().min(0).max(MAX_REMITTANCE_CENTS),
    note: z.string().max(REMITTANCE_NOTE_MAX).nullish(),
  })
  .strict()

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/**
 * POST /api/cash/remittances/[id]/accept-pin — "PIN here now" (CONTRACTS W2.3).
 *
 * Body `{ receiverUserId, pin, receivedCents, note? }`. The merchant app
 * (Bearer, via `withRequestBearer`) or the web admin (cookie). The caller is
 * the remittance's cashier at the counter, or a member reaching its branch;
 * the receiver is proven by their manager PIN (the Senior/PWD approver PIN:
 * same limits, same escalating lock), must hold `cash_manage` with branch
 * reach, and the acceptance is written by `accept_remittance_as` (service role).
 *
 * 200 `{ remittance }` · 400 bad body / note needed · 401 · 403 caller or
 * receiver refused · 404 not visible · 409 not pending · 412 no PIN set ·
 * 422 wrong PIN `{ triesLeft }` · 423 locked `{ lockedUntil }` · 429 slow down.
 */
export function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withRequestBearer(request, () => handle(request, context))
}

async function handle(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'That remittance isn’t available.' }, 404)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Check the amount and PIN.' }, 400)

  const { user, appUser, roleError } = await getRequestCaller()
  if (!user) return json({ error: 'Unauthorized' }, 401)
  // Fail closed: an errored account read is no account.
  if (roleError || !appUser) return json({ error: 'Forbidden' }, 403)

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createRemittancePinStore } = await import('@/lib/cash/remittance-pin-store')

  try {
    const store = createRemittancePinStore(createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }), user.id)
    const outcome = await acceptRemittanceByPin(
      store,
      {
        userId: user.id,
        role: appUser.role,
        tenantId: appUser.tenant_id,
        isOwner: appUser.is_owner === true,
        outletId: appUser.outlet_id ?? null,
      },
      { remittanceId: id, ...parsed.data, note: parsed.data.note ?? null },
    )
    if (!outcome.ok) return json(outcome.body, outcome.status)
    return json({ remittance: outcome.remittance }, 200)
  } catch (error) {
    console.error('[cash/accept-pin] failed', { remittanceId: id, error: error instanceof Error ? error.message : 'unknown' })
    return json({ error: 'Could not check the PIN. Try again.' }, 500)
  }
}
