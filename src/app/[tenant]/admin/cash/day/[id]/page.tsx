import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { getCachedTenantBySlug } from '@/lib/cache'
import { cashAccessFor, cashHref } from '@/lib/cash/cash-page'
import { asCashRpcClient } from '@/lib/cash/cash-rpc'
import { depositDifferenceCents, getBusinessDayClose } from '@/lib/cash/day-close'
import { createClient } from '@/lib/supabase/server'
import { clockLabel, formatMoney, longDayLabel } from '@/components/admin/cash/cash-format'
import { CashLoadFailed, CashLocked } from '@/components/admin/cash/cash-states'
import { DayCloseSummary } from '@/components/admin/cash/day-close-summary'
import { PrintButton } from '@/components/admin/cash/print-button'

interface DayClosePrintPageProps {
  params: Promise<{ tenant: string; id: string }>
}

/** Print only the day close, not the admin shell around it. Static CSS, no user input. */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #day-close-print, #day-close-print * { visibility: visible !important; }
  #day-close-print { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0; }
  .day-close-print-hide { display: none !important; }
}`

/**
 * `/[tenant]/admin/cash/day/[id]` — one business-day close, laid out to print
 * (CONTRACTS W3.2). Titled "DAY CLOSE", never "Z-READING": WebNegosyo is not a
 * BIR-accredited POS. Read through the caller's session (`get_business_day_close`,
 * which masks sales for a caller without `reports`).
 */
export default async function DayClosePrintPage({ params }: DayClosePrintPageProps) {
  const { tenant: tenantSlug, id } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  const { appUser, roleError } = await getRequestCaller()
  const access = cashAccessFor(roleError ? null : appUser, tenant.id)
  if (!access.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <CashLocked reason={access.reason} />
      </div>
    )
  }

  const result = await getBusinessDayClose(asCashRpcClient(await createClient()), id)
  if (!result.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <CashLoadFailed what="this day close" />
      </div>
    )
  }
  const close = result.data
  if (!close) notFound()

  const difference = depositDifferenceCents(close)
  const backHref = cashHref(tenantSlug, { tab: 'days', day: close.businessDay, branch: close.outletId })

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <style>{PRINT_CSS}</style>
      <div className="day-close-print-hide flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-bold text-wn-stone hover:text-wn-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Day closes
        </Link>
        <PrintButton label="Print day close" />
      </div>

      <article id="day-close-print" className="flex flex-col gap-5 rounded-2xl bg-white p-6 ring-1 ring-border print:rounded-none print:ring-0">
        <header className="flex flex-col gap-1 border-b border-wn-line pb-4">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-wn-stone">Day close</p>
          <h1 className="text-[24px] font-extrabold tracking-[-0.01em] text-wn-ink">{tenant.name}</h1>
          <p className="text-[14px] text-wn-ink">
            {longDayLabel(close.businessDay)} · {clockLabel(close.windowStart)} – {clockLabel(close.windowEnd)}
          </p>
          <p className="text-[13px] text-wn-stone">
            Closed by {close.closedByName} at {clockLabel(close.closedAt)}
            {close.version > 1 ? ` · version ${close.version}` : ''}
            {close.status === 'reopened' ? ` · REOPENED${close.reopenReason ? `: ${close.reopenReason}` : ''}` : ''}
          </p>
          {close.note && <p className="text-[13px] text-wn-ink">Note: {close.note}</p>}
        </header>

        <DayCloseSummary snapshot={close.snapshot} isDrawersOnly={close.salesSource === 'drawers_only'} />

        <section className="flex flex-col gap-1 border-t border-wn-line pt-4">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-wn-stone">Deposit</h3>
          {close.depositRecordedAt ? (
            <p className="text-[14px] text-wn-ink tabular-nums">
              {formatMoney(close.depositCents, { centavos: true })} to {close.depositTo}
              {close.depositRef ? ` · ref ${close.depositRef}` : ''}
              {difference !== null && difference !== 0
                ? ` · ${formatMoney(Math.abs(difference), { centavos: true })} ${difference < 0 ? 'less' : 'more'} than the cash to deposit`
                : ''}
            </p>
          ) : (
            <p className="text-[14px] text-wn-stone">Not recorded yet.</p>
          )}
          {close.unsettledRemittanceIds.length > 0 && (
            <p className="text-[13px] text-amber-900">Closed with {close.unsettledRemittanceIds.length} remittance(s) not yet accepted.</p>
          )}
        </section>

        <footer className="border-t border-wn-line pt-3 text-[12px] leading-relaxed text-wn-stone">
          Not an official receipt. Not a BIR Z-reading. For store use. All times are Philippine time.
        </footer>
      </article>
    </div>
  )
}
