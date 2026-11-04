import type { SupabaseClient } from '@supabase/supabase-js'
import { previousBusinessDayKey } from '@/lib/inventory/business-day'
import { asCashRpcClient } from '@/lib/cash/cash-rpc'
import type { CashPageContext } from '@/lib/cash/cash-page'
import { getBusinessDayClose, getDayCloseStatus, listDayCloses, type DayClose } from '@/lib/cash/day-close'
import { createClient } from '@/lib/supabase/server'
import { CashLoadFailed } from '@/components/admin/cash/cash-states'
import { DayClosePanel } from '@/components/admin/cash/day-close-panel'
import { DayClosesHistory } from '@/components/admin/cash/day-closes-history'

const HISTORY_DAYS = 30

function daysBack(day: string, count: number): string {
  let key = day
  for (let index = 1; index < count; index += 1) key = previousBusinessDayKey(key)
  return key
}

async function readHistory(db: SupabaseClient, context: CashPageContext): Promise<DayClose[] | null> {
  try {
    return await listDayCloses(db, { tenantId: context.tenantId, fromDay: daysBack(context.today, HISTORY_DAYS), toDay: context.today, outletId: context.outletId })
  } catch (error) {
    console.error('[cash] day close history unavailable', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * "Day closes": close the business day shown (checklist + preview), or — when
 * it is closed — its frozen figures, deposit, print and reopen; then the last
 * 30 days of closes. Every read is the caller's (cash managers, branch reach).
 */
export async function CashDaysSection({ context }: { context: CashPageContext }) {
  const db = (await createClient()) as unknown as SupabaseClient
  const client = asCashRpcClient(db)
  const [status, history] = await Promise.all([
    getDayCloseStatus(client, { tenantId: context.tenantId, outletId: context.outletId, day: context.day }),
    readHistory(db, context),
  ])
  if (!status.ok) return <CashLoadFailed what="the day close" />

  const live = status.data.existingClose?.status === 'closed' ? status.data.existingClose : null
  const close = live ? await getBusinessDayClose(client, live.id) : null
  const printHref = live ? `/${encodeURIComponent(context.tenantSlug)}/admin/cash/day/${live.id}` : null

  return (
    <div className="flex flex-col gap-6">
      {close && !close.ok ? (
        <CashLoadFailed what="the closed day" />
      ) : (
        <DayClosePanel
          tenantSlug={context.tenantSlug}
          outletId={context.outletId}
          day={context.day}
          status={status.data}
          close={close?.ok ? close.data : null}
          isOwner={context.isOwner}
          printHref={printHref}
        />
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-wn-stone">Last {HISTORY_DAYS} days</h2>
        {history === null ? (
          <CashLoadFailed what="the day close history" />
        ) : (
          <DayClosesHistory closes={history} tenantSlug={context.tenantSlug} today={context.today} outletNames={context.outletNames} />
        )}
      </section>
    </div>
  )
}
