/**
 * get_staff_activity — who rang up sales, confirmed, completed or cancelled
 * orders in a period. Owner only: it is a judgement about people.
 */

import { z } from 'zod'
import { loadOrderStatusEvents } from '@/lib/staff-activity/staff-activity-service'
import { summarizeStaffActivity, type StaffActivityRow } from '@/lib/staff-activity/order-event'
import { activityWindow, ACTIVITY_PERIODS, ACTIVITY_PERIOD_LABELS } from '@/lib/staff-activity/activity-period'
import { formatPeso } from '@/components/admin/dashboard/dashboard-format'
import { staffLabel } from '@/lib/assistant/insights/customer-label'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const ROW_LIMIT = 8

const input = z.object({ period: z.enum(ACTIVITY_PERIODS) })
type Input = z.infer<typeof input>

export function buildStaffActivityResult(rows: readonly StaffActivityRow[], period: Input['period'], isTruncated: boolean, refs: RefBook): ToolResult {
  const shown = rows.slice(0, ROW_LIMIT)
  return {
    facts: {
      period: ACTIVITY_PERIOD_LABELS[period],
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
      subtitle: ACTIVITY_PERIOD_LABELS[period],
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
  description: 'Per-staff POS sales, confirmed/completed/cancelled orders, last active.',
  access: { ownerOnly: true },
  input,
  async run(ctx, { period }) {
    const window = activityWindow(period, Date.now())
    const page = await loadOrderStatusEvents(ctx.tenantId, { sinceIso: new Date(window.startMs).toISOString(), untilIso: new Date(window.endMs).toISOString() })
    return buildStaffActivityResult(summarizeStaffActivity(page.events, window), period, page.isTruncated, ctx.refs)
  },
}
