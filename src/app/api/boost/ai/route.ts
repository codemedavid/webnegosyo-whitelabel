import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { asAppUserQueryClient, fetchAppUserScope } from '@/lib/queries/fetch-app-user-scope'
import { assertSubscriptionActive } from '@/lib/billing/subscription-gate'
import { fetchSubscription } from '@/lib/billing/subscription-repository'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedTenantBySlug, invalidateTenantCache } from '@/lib/cache'
import { getBoostMenu } from '@/lib/boost/workspace'
import { setBoostEnabled } from '@/lib/boost/writes'
import { refreshOfferCaches } from '@/lib/boost/refresh-offer-caches'
import { listBoostAiLog } from '@/lib/boost/ai/store'
import { presentBoostAiState, type BoostAiStateView } from '@/lib/boost/ai/present'
import { FREE_BOOST_AI_GENERATIONS } from '@/lib/boost/ai/lifecycle'
import {
  createBoostAiProposalNow,
  decideBoostAiProposal,
  generateBoostAiProposals,
  loadBoostAiProposal,
  type BoostAiTenant,
} from '@/lib/boost/ai/service'
import {
  BOOST_AI_CREATE_ACTION,
  BOOST_AI_OP_ACTION,
  boostAiCreatePermissions,
  decideBoostAiAccess,
  parseBoostAiRequest,
  type BoostAiCaller,
  type BoostAiRequest,
} from '@/lib/boost/ai/mobile-request'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { StaffPermissionKey } from '@/lib/staff-permissions'

/**
 * POST /api/boost/ai
 *
 * The merchant app's Growth tab: AI offer ideas (combos, upgrades, pairings, a
 * cart last call) read from the store's real menu and order baskets, and one
 * tap to put an idea live. The app cannot import `src/`, so this route runs the
 * SAME engine, quota and validation as the web's Boost Sales screen
 * (`src/lib/boost/ai/service.ts`) and answers with display-ready text.
 *
 * Body: `{ tenantId, op }` where op is `state | generate | enable | create |
 * dismiss` (`create`/`dismiss` also take `proposalId`). Every op answers with
 * the fresh state, so the app only ever replaces what it shows.
 *
 * Authenticated with the caller's own access token, like its sibling routes.
 * The gate is the web's: an admin of THIS store holding `analytics` (and
 * `menu` for a combo), a live subscription for every write. Only then do the
 * writes run on the service role (`ProvisioningCtx`).
 */

// A generation reads the menu and order history, then waits on the model (45s cap).
export const maxDuration = 60

interface ErrorBody {
  success: false
  error: string
}

function refuse(error: string, status: number): NextResponse<ErrorBody> {
  return NextResponse.json({ success: false, error }, { status })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const BASE_PERMISSIONS: readonly StaffPermissionKey[] = ['analytics']

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = parseBoostAiRequest(await request.json().catch(() => null))
  if (!parsed.ok) return refuse(parsed.error, 400)
  const body = parsed.value

  const authHeader = request.headers.get('authorization')
  if (!authHeader) return refuse('Unauthorized', 401)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return refuse('Unauthorized', 401)

  const { appUser } = await fetchAppUserScope(asAppUserQueryClient(supabase), user.id)
  const action = BOOST_AI_OP_ACTION[body.op]
  if (!decideBoostAiAccess(appUser, body.tenantId, action, BASE_PERMISSIONS)) {
    return refuse('You do not have access to Boost Sales for this store.', 403)
  }

  if (body.op !== 'state') {
    // Same subscription boundary every admin write passes (`verifyTenantAdmin`).
    try {
      assertSubscriptionActive(await fetchSubscription(supabase as never, body.tenantId), { role: appUser?.role ?? '' })
    } catch (error) {
      return refuse(errorMessage(error, 'Your subscription is paused.'), 402)
    }
  }

  try {
    return await runOp(body, user.id, appUser)
  } catch (error) {
    console.error(`[boost-ai] app ${body.op}:`, error)
    return refuse(errorMessage(error, 'Something went wrong. Please try again.'), 500)
  }
}

async function runOp(body: BoostAiRequest, userId: string, caller: BoostAiCaller | null): Promise<NextResponse> {
  const admin = createAdminClient()
  const { data: row } = await admin.from('tenants').select('slug').eq('id', body.tenantId).maybeSingle()
  const tenant = row?.slug ? await getCachedTenantBySlug(row.slug) : null
  if (!tenant || tenant.id !== body.tenantId) return refuse('Store not found.', 404)

  const ctx: ProvisioningCtx = { client: admin }
  let notice: string | null = null

  switch (body.op) {
    case 'state':
      break
    case 'generate': {
      const outcome = await generateBoostAiProposals(tenant, userId)
      if (outcome.status === 'quota_exhausted') {
        return refuse(`You have used all ${FREE_BOOST_AI_GENERATIONS} free AI generations for this store.`, 409)
      }
      if (outcome.status === 'failed') return refuse(outcome.error, 502)
      notice = `${outcome.proposals} offer idea${outcome.proposals === 1 ? '' : 's'} ready — tap Create on the ones you like.`
      break
    }
    case 'enable':
      await turnOnBoostSales(tenant, ctx)
      notice = 'Boost Sales is on — customers now see your offers.'
      break
    case 'dismiss':
      await decideBoostAiProposal(tenant.id, userId, body.proposalId, 'reject')
      break
    case 'create': {
      const proposal = await loadBoostAiProposal(tenant.id, body.proposalId)
      const permissions = boostAiCreatePermissions(proposal.kind)
      if (!decideBoostAiAccess(caller, tenant.id, BOOST_AI_CREATE_ACTION[proposal.kind], permissions)) {
        return refuse(
          proposal.kind === 'combo'
            ? 'Creating combos needs the Menu permission. Ask the store owner.'
            : 'You do not have permission to create this offer. Ask the store owner.',
          403,
        )
      }
      const outcome = await createBoostAiProposalNow(tenant, userId, body.proposalId, ctx)
      if (outcome === 'needs-edit') {
        notice = 'This one needs a small edit first — finish it in Boost Sales on the web.'
        break
      }
      // An offer customers cannot see is not an offer. The app's button says
      // "Turn on Boost Sales & create" whenever this branch will run.
      if (await isBoostEnabled(tenant.id)) {
        notice = 'Created — customers see it now.'
      } else {
        await turnOnBoostSales(tenant, ctx)
        notice = 'Created, and Boost Sales is now on — customers see it.'
      }
      break
    }
  }

  return NextResponse.json({ success: true, notice, state: await readState(tenant) })
}

/** Read fresh: the cached tenant row may predate an `enable`. */
async function isBoostEnabled(tenantId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('tenants')
    .select('menu_engineering_enabled')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`Could not read Boost Sales status: ${error.message}`)
  return data?.menu_engineering_enabled === true
}

/** The switch, then every cache that carries it, so the storefront sees it. */
async function turnOnBoostSales(tenant: BoostAiTenant, ctx: ProvisioningCtx): Promise<void> {
  await setBoostEnabled(tenant.id, true, ctx)
  await invalidateTenantCache(tenant.slug, tenant.id)
  await refreshOfferCaches(tenant.id, tenant.slug)
}

async function readState(tenant: BoostAiTenant): Promise<BoostAiStateView> {
  const [boostEnabled, log, menu] = await Promise.all([
    isBoostEnabled(tenant.id),
    listBoostAiLog(tenant.id),
    getBoostMenu(tenant),
  ])
  const items = new Map(menu.items.map((item) => [item.id, { name: item.name }]))
  return presentBoostAiState(log, items, boostEnabled)
}
