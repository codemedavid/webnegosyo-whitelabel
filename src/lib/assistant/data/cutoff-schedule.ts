/**
 * The store's business-day cutoff schedule for Owl's date questions, read once
 * per turn through the caller's own session (every member of the store may
 * read it). A failed read falls back to Manila midnight, like Reports.
 */

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { readCutoffScheduleForDisplay } from '@/lib/business-day/read-schedule'
import type { CutoffSchedule } from '@/lib/business-day/trading-day'
import type { AssistantToolContext } from '@/lib/assistant/tools/registry'

export function cutoffScheduleFor(ctx: Pick<AssistantToolContext, 'memo' | 'tenantId'>): Promise<CutoffSchedule> {
  return ctx.memo('cutoff-schedule', async () => (await readCutoffScheduleForDisplay(await createClient(), ctx.tenantId)).schedule)
}
