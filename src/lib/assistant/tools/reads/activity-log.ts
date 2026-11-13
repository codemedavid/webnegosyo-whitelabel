/**
 * get_activity_log — the Store Activity log: who did what, when. Voids,
 * cancels, discounts, refunds, marked paid, pay-outs, reprints, price changes,
 * sold out, stock moves, shift and day closes, expenses, approvals.
 *
 * Read through the CALLER's session (`get_store_activity` /
 * `get_store_activity_summary`): the database decides visibility from
 * auth.uid() — `activity_view` / `approve_requests` / owner see everyone,
 * 'team' rows are owner-only, flags are private, a branch account its branch.
 * The tool gate (`activity_view`) only keeps the tool away from people the
 * database would show nothing but their own rows.
 */

import 'server-only'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  fetchStoreActivity,
  fetchStoreActivitySummary,
  StoreActivityError,
  type ActivityRpcClient,
} from '@/lib/activity/repository'
import { ACTIVITY_CATEGORIES } from '@/lib/activity/taxonomy'
import type { StoreActivitySummary } from '@/lib/activity/store-event'
import { cutoffScheduleFor } from '@/lib/assistant/data/cutoff-schedule'
import { resolveWhen, whenFields } from '@/lib/assistant/insights/when'
import { buildActivityLogResult, orderLabel } from '@/lib/assistant/insights/activity-log'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

const PAGE = 25
/** An order's lines are picked out of a wider page: its number is searched as text. */
const ORDER_PAGE = 100

const input = z.object({
  ...whenFields,
  staff: z.string().trim().min(1).max(60).optional().describe('Staff ref (s2) or name'),
  category: z.enum(ACTIVITY_CATEGORIES).optional(),
  order: z.string().trim().min(1).max(10).optional().describe('Order number, e.g. 42'),
  search: z.string().trim().min(2).max(60).optional().describe('Text in the entry: dish, ingredient, reason'),
  flaggedOnly: z.boolean().optional().describe('Only entries that need a look'),
  includeRoutine: z.boolean().optional().describe('Also every order placed / stock used by sales'),
})
type Input = z.infer<typeof input>

function foldName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase().trim()
}

type ActorPick = { ok: true; id: string | null } | { ok: false; reason: string }

/** A ref from this conversation, else a name the window's roll-up knows. */
function pickActor(raw: string | undefined, refs: Parameters<AssistantToolDef['run']>[0]['refs'], summary: StoreActivitySummary | null): ActorPick {
  if (!raw) return { ok: true, id: null }
  const byRef = refs.resolve(raw, 'staff')
  if (byRef) return { ok: true, id: byRef }
  const wanted = foldName(raw)
  const matches = new Map<string, string>()
  for (const row of summary?.byActor ?? []) {
    if (row.actorUserId && row.actorName && foldName(row.actorName).includes(wanted)) matches.set(row.actorUserId, row.actorName)
  }
  if (matches.size === 1) return { ok: true, id: [...matches.keys()][0] }
  if (matches.size > 1) return { ok: false, reason: `More than one person matches "${raw}": ${[...matches.values()].join(', ')}. Say which one.` }
  return { ok: false, reason: `No activity by anyone called "${raw}" in this period.` }
}

export const getActivityLogTool: AssistantToolDef<Input> = {
  name: 'get_activity_log',
  description:
    'Store activity log for any period: who cancelled, refunded, discounted, marked paid, took cash out, reprinted, changed prices/stock, closed shifts. Filter by staff, category, order number, text. Default today.',
  access: { permission: 'activity_view' },
  input,
  async run(ctx, args) {
    const now = Date.now()
    const resolved = resolveWhen(args, now, await cutoffScheduleFor(ctx), 'today')
    if (!resolved.ok) return { facts: { available: false, reason: resolved.error } }
    const { when } = resolved

    const label = args.order ? orderLabel(args.order) : null
    if (args.order && !label) return { facts: { available: false, reason: 'Give the order number as digits, e.g. 42.' } }

    const client = (await createClient()) as unknown as ActivityRpcClient
    const since = new Date(when.start).toISOString()
    const until = new Date(when.end).toISOString()

    try {
      // The roll-up also resolves a staff NAME, so it is read whenever a name may need it.
      const summary = await fetchStoreActivitySummary(client, ctx.tenantId, { since, until }).catch(() => null)
      const actor = pickActor(args.staff, ctx.refs, summary)
      if (!actor.ok) return { facts: { available: false, reason: actor.reason } }

      const page = await fetchStoreActivity(client, ctx.tenantId, {
        limit: label ? ORDER_PAGE : PAGE,
        since,
        until,
        categories: args.category ? [args.category] : null,
        actorUserId: actor.id,
        flaggedOnly: args.flaggedOnly ?? false,
        // An order's own history includes its routine lines (placed, status moves).
        includeRoutine: label ? true : (args.includeRoutine ?? false),
        search: label ?? args.search ?? null,
      })
      const events = label ? page.events.filter((event) => event.orderNumber === label) : page.events
      const isFiltered = Boolean(args.staff || args.category || label || args.search || args.flaggedOnly)

      return buildActivityLogResult({
        when,
        events,
        summary: isFiltered ? null : summary,
        hasMore: page.nextCursor !== null && (!label || events.length >= PAGE),
        filters: {
          staffRef: actor.id ? ctx.refs.refFor('staff', actor.id) : null,
          category: args.category ?? null,
          order: label,
          search: args.search ?? null,
          flaggedOnly: args.flaggedOnly ?? false,
          includeRoutine: args.includeRoutine ?? false,
        },
        refs: ctx.refs,
        nowIso: new Date(now).toISOString(),
      })
    } catch (error) {
      if (error instanceof StoreActivityError && error.code === 'not_allowed') {
        return { facts: { available: false, reason: 'This account may not see the store activity log.' } }
      }
      if (error instanceof StoreActivityError && error.code === 'invalid_input') {
        return { facts: { available: false, reason: error.message } }
      }
      throw error
    }
  },
}
