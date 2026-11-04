import Link from 'next/link'
import { ChevronRight, Moon } from 'lucide-react'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { readCutoffScheduleForDisplay } from '@/lib/business-day/read-schedule'
import { cutoffMinutesFor, describeCutoff, tradingDayOf } from '@/lib/business-day/trading-day'
import { hasPermission } from '@/lib/staff-permissions'
import { createClient } from '@/lib/supabase/server'
import { longDayLabel } from './cash-format'

/**
 * Read-only "Business day ends at 4:00 AM · Change" row for Settings → Hours.
 * The setting itself lives on Cash & remits → Settings (one place to change
 * it); "Change" is offered only to accounts that can open that page.
 */
export async function BusinessDayRow({ tenantId, tenantSlug }: { tenantId: string; tenantSlug: string }) {
  const [{ schedule, isFallback }, { appUser, roleError }] = await Promise.all([
    readCutoffScheduleForDisplay(await createClient(), tenantId),
    getRequestCaller(),
  ])
  const today = tradingDayOf(new Date().toISOString(), schedule)
  const label = describeCutoff(cutoffMinutesFor(schedule, today)).label
  const pending = schedule.find((change) => change.effectiveFrom > today) ?? null
  const canOpenCash = !roleError && appUser !== null && hasPermission(appUser, 'cash_manage')

  return (
    <section aria-label="Business day" className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-5 py-4 ring-1 ring-border">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-wn-sand ring-1 ring-wn-line">
        <Moon className="size-4 text-wn-stone" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold text-wn-ink">
          Business day ends at {isFallback ? '— (couldn’t load)' : label}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-wn-stone">
          {pending
            ? `From ${longDayLabel(pending.effectiveFrom)} it ends at ${describeCutoff(pending.cutoffMinutes).label}.`
            : 'Late-night sales count toward the day they started. Shifts, remittances and the day close follow it.'}
        </p>
      </div>
      {canOpenCash ? (
        <Link
          href={`/${encodeURIComponent(tenantSlug)}/admin/cash?tab=settings#business-day`}
          className="inline-flex min-h-10 items-center gap-1 rounded-full bg-white px-4 text-[13.5px] font-bold text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
        >
          Change
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <p className="text-[12.5px] text-wn-stone">The owner changes it in Cash &amp; remits.</p>
      )}
    </section>
  )
}
