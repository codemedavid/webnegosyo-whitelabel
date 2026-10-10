/**
 * Reads behind "Start here": the signals that tick the path, the orders behind
 * the goal trackers, and what the build left ready. Server-only, service role,
 * called only after the caller is verified as an admin of the store.
 *
 * Every read is bounded and indexed (tenant_id first). A read that fails
 * degrades its own signal to `null` (that step can then be ticked by hand),
 * never the whole page.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { findOnboardingByTenant, type StoreOnboarding } from './repository'
import { buildStartPath, type PathSignals, type StartPath } from './start-path'
import { buildGoalTrackers, type GoalTracker, type TrackedOrder } from './goal-trackers'
import type { ChannelId, GoalId } from './goals'

/** A new store's first weeks fit well under this; trackers only need a sample. */
const MAX_ORDER_ROWS = 1000

export interface StartHereTenant extends OrderBackendTenantFields {
  id: string
  slug: string
  is_prelaunch?: boolean | null
}

export interface ReadyForYou {
  combosLive: number | null
  stampCard: string | null
  textsReady: number | null
}

export interface StartHereData {
  /** For the greeting; '' when unknown. */
  firstName: string
  goals: GoalId[]
  channels: ChannelId[]
  path: StartPath
  trackers: GoalTracker[]
  ready: ReadyForYou
  warnings: string[]
}

type Admin = SupabaseClient

async function safely<T>(label: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch (error) {
    console.error(`[start-here] ${label} read failed`, error instanceof Error ? error.message : error)
    return null
  }
}

async function countRows(query: PromiseLike<{ count: number | null; error: { message: string } | null }>, label: string): Promise<number> {
  const { count, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return count ?? 0
}

async function readLead(admin: Admin, onboarding: StoreOnboarding): Promise<{ liveSince: string; firstName: string }> {
  const { data } = await admin.from('checkout_leads').select('live_at, paid_at, name').eq('id', onboarding.checkoutLeadId).maybeSingle()
  const lead = data as { live_at: string | null; paid_at: string | null; name: string | null } | null
  return {
    liveSince: lead?.live_at ?? lead?.paid_at ?? onboarding.createdAt,
    firstName: (lead?.name ?? '').trim().split(/\s+/)[0] ?? '',
  }
}

interface OrderRow {
  total: number | string | null
  source: string | null
  customer_id: string | null
  customer_contact: string | null
  has_bundle_items: boolean | null
}

async function readOrders(admin: Admin, tenantId: string, since: string): Promise<OrderRow[]> {
  const { data, error } = await admin
    .from('orders')
    .select('total, source, customer_id, customer_contact, has_bundle_items')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(MAX_ORDER_ROWS)
  if (error) throw new Error(error.message)
  return (data ?? []) as OrderRow[]
}

function customerKey(row: OrderRow): string | null {
  if (row.customer_id) return `id:${row.customer_id}`
  const contact = row.customer_contact?.replace(/\D/g, '') ?? ''
  return contact.length >= 7 ? `phone:${contact.slice(-10)}` : null
}

async function readLaunchCombosWaiting(admin: Admin, tenantId: string): Promise<number | null> {
  const { data, error } = await admin.from('boost_ai_generations').select('id').eq('tenant_id', tenantId).eq('source', 'launch').maybeSingle()
  if (error) throw new Error(error.message)
  const generationId = (data as { id: string } | null)?.id
  if (!generationId) return null
  return countRows(
    admin.from('boost_ai_proposals').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('generation_id', generationId).in('status', ['pending', 'approved']),
    'launch combos',
  )
}

async function readBestSellerPhotos(admin: Admin, tenantId: string): Promise<{ withPhoto: number; total: number }> {
  const { data, error } = await admin.from('menu_items').select('image_url').eq('tenant_id', tenantId).eq('is_featured', true).limit(50)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ image_url: string | null }>
  return { withPhoto: rows.filter((row) => !!row.image_url?.trim()).length, total: rows.length }
}

async function readTicks(admin: Admin, tenantId: string): Promise<Set<string>> {
  const { data, error } = await admin.from('owner_path_ticks').select('step_id').eq('tenant_id', tenantId).limit(50)
  if (error) throw new Error(error.message)
  return new Set(((data ?? []) as Array<{ step_id: string }>).map((row) => row.step_id))
}

async function readLessonsWatched(admin: Admin, userId: string | null): Promise<number> {
  if (!userId) return 0
  return countRows(admin.from('university_lesson_progress').select('lesson_id', { count: 'exact', head: true }).eq('user_id', userId), 'lessons watched')
}

/** Null when the store was not set up through onboarding (no goals to frame a path with). */
export async function loadStartHere(
  admin: Admin,
  tenant: StartHereTenant,
  opts: { userId: string | null; shareUrl: string | null; platformOrigin: string },
): Promise<StartHereData | null> {
  const onboarding = await findOnboardingByTenant(admin, tenant.id)
  if (!onboarding?.answers) return null

  const { liveSince, firstName } = await readLead(admin, onboarding)
  const isPlatform = resolveOrderBackend(tenant) === 'platform'
  const [orders, combosWaiting, appLogins, stamps, activeTexts, draftTexts, photos, ticks, lessonsWatched, combosLive] = await Promise.all([
    isPlatform ? safely('orders', () => readOrders(admin, tenant.id, liveSince)) : Promise.resolve(null),
    safely('launch combos', () => readLaunchCombosWaiting(admin, tenant.id)),
    safely('app logins', () => countRows(admin.from('platform_device_tokens').select('token', { count: 'exact', head: true }).eq('tenant_id', tenant.id), 'app')),
    safely('stamps', () => countRows(admin.from('loyalty_ledger').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('kind', 'earn'), 'stamps')),
    safely('texts', () => countRows(admin.from('sms_campaigns').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'active'), 'texts')),
    safely('draft texts', () => countRows(admin.from('sms_campaigns').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'draft'), 'drafts')),
    safely('photos', () => readBestSellerPhotos(admin, tenant.id)),
    safely('ticks', () => readTicks(admin, tenant.id)),
    safely('lessons', () => readLessonsWatched(admin, opts.userId)),
    safely('combos', () => countRows(admin.from('bundles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true), 'bundles')),
  ])

  const signals: PathSignals = {
    isLive: tenant.is_prelaunch !== true,
    // Unreadable or no launch combos: the review step is left out rather than blocking the path.
    launchCombosWaiting: combosWaiting,
    hasAppLogin: appLogins === null ? null : appLogins > 0,
    orderCount: orders ? orders.length : null,
    comboOrderCount: orders ? orders.filter((row) => row.has_bundle_items).length : null,
    stampsGiven: stamps,
    activeTexts,
    bestSellerPhotos: photos,
    posOrderCount: orders ? orders.filter((row) => row.source === 'pos').length : null,
    lessonsWatched: lessonsWatched ?? 0,
    ticks: ticks ?? new Set(),
  }

  const answers = onboarding.answers
  const goals = answers.goals ?? []
  const channels = answers.channels ?? []
  const tracked: TrackedOrder[] | null = orders
    ? orders.map((row) => ({ total: Number(row.total ?? 0), source: row.source, customerKey: customerKey(row) }))
    : null
  const loyalty = onboarding.summary?.loyalty ?? null

  return {
    firstName,
    goals,
    channels,
    path: buildStartPath({ goals, channels, adminPath: `/${tenant.slug}/admin`, shareUrl: opts.shareUrl, platformOrigin: opts.platformOrigin }, signals),
    trackers: buildGoalTrackers({ goals, dailyOrders: answers.dailyOrders ?? null, typicalOrder: answers.typicalOrder ?? null, orders: tracked }),
    ready: {
      combosLive,
      stampCard: loyalty ? `${loyalty.threshold} orders → ${loyalty.rewardLabel}` : null,
      textsReady: draftTexts,
    },
    warnings: onboarding.summary?.warnings ?? [],
  }
}

/** Whether the owner still has path steps left (drives the admin landing redirect). */
export function isStartHereOpen(data: StartHereData | null): boolean {
  return !!data && !data.path.isComplete
}
