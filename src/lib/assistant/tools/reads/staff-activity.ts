/**
 * get_staff_activity — who rang up sales, confirmed, completed or cancelled
 * orders in a period (any date, `insights/when.ts`; business days like
 * Reports). Owner only: it is a judgement about people. The line-by-line log
 * of who did what is get_activity_log.
 */

import { z } from 'zod'
import { loadOrderStatusEvents } from '@/lib/staff-activity/staff-activity-service'
import { summarizeStaffActivity, type StaffActivityRow } from '@/lib/staff-activity/order-event'
import { cutoffScheduleFor } from '@/lib/assistant/data/cutoff-schedule'
import { resolveWhen, whenFacts, whenFields, type ResolvedWhen } from '@/lib/assistant/insights/when'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { staffLabel } from '@/lib/assistant/insights/customer-label'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const ROW_LIMIT = 8

const input = z.object(whenFields)
type Input = z.infer<typeof input>

export function buildStaffActivityResult(rows: readonly StaffActivityRow[], when: ResolvedWhen, isTruncated: boolean, refs: RefBook): ToolResult {
  const shown = rows.slice(0, ROW_LIMIT)
  return {
    facts: {
      ...whenFacts(when),
      staff: shown.map((row) => ({
        ref: refs.refFor('staff', row.actorUserId),
        name: staffLabel(row.actorName),
        posSales: row.posSales,
        posSalesTotal: row.posSalesTotal,
        confirmed: row.confirmed,
        completed: row.completed,
        cancelled: row.cancelled,
        kitchenMoves: row.progressed,
        lastActive: row.lastActiveAt?.slice(0, 16) ?? null,
      })),
      ...(isTruncated ? { caveat: 'Very busy period: the oldest activity was not read.' } : {}),
      ...(shown.length === 0 ? { note: 'No recorded staff activity in this period.' } : {}),
    },
    card: {
      type: 'ranked',
      title: 'Staff activity',
      subtitle: when.label,
      rows: shown.map((row) => ({
        label: row.actorName,
        value: formatPeso(row.posSalesTotal + row.confirmedTotal),
        detail: `${row.posSales} POS sales · ${row.confirmed} confirmed · ${row.completed} completed${row.cancelled ? ` · ${row.cancelled} cancelled` : ''}`,
      })),
      emptyText: 'No recorded staff activity in this period.',
    },
    links: [{ label: 'Open Staff', path: '/staff' }],
  }
}

export const getStaffActivityTool: AssistantToolDef<Input> = {
  name: 'get_staff_activity',
  description: 'Per-staff totals for any period: POS sales, confirmed/completed/cancelled orders, last active. Default last 7 days.',
  access: { ownerOnly: true },
  input,
  async run(ctx, args) {
    const resolved = resolveWhen(args, Date.now(), await cutoffScheduleFor(ctx))
    if (!resolved.ok) return { facts: { available: false, reason: resolved.error } }
    const { when } = resolved
    const window = { startMs: when.start, endMs: when.end }
    // until is inclusive in the reader; the summary re-applies the half-open window.
    const page = await loadOrderStatusEvents(ctx.tenantId, { sinceIso: new Date(when.start).toISOString(), untilIso: new Date(when.end).toISOString() })
    return buildStaffActivityResult(summarizeStaffActivity(page.events, window), when, page.isTruncated, ctx.refs)
  },
}
