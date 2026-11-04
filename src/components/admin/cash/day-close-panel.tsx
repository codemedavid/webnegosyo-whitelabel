'use client'

import { useId, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Printer, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { closeDayAction, recordDepositAction, reopenDayAction } from '@/app/actions/cash'
import { DAY_CLOSE_NOTE_MAX, DEPOSIT_TEXT_MAX, REOPEN_REASON_MAX, depositDifferenceCents, type DayClose, type DayCloseStatus } from '@/lib/cash/day-close'
import { clockLabel, formatMoney, weekdayLabel } from './cash-format'
import { parseFloatPesos } from './cash-rules-form'
import { DayCloseSummary } from './day-close-summary'
import { FIELD_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON } from './settings-ui'

export interface DayClosePanelProps {
  tenantSlug: string
  outletId: string | null
  day: string
  status: DayCloseStatus
  /** The live close for the day, when there is one. */
  close: DayClose | null
  isOwner: boolean
  printHref: string | null
}

function Check({ tone, children }: { tone: 'ok' | 'warn' | 'block'; children: ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : XCircle
  const color = tone === 'ok' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-red-700'
  return (
    <li className="flex items-start gap-2.5 py-2 text-[14px] text-wn-ink">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
      <span>{children}</span>
    </li>
  )
}

/** "Close Friday" (06 §4.5): checklist, preview, close / close anyway; then deposit, print and reopen. */
export function DayClosePanel({ tenantSlug, outletId, day, status, close, isOwner, printHref }: DayClosePanelProps) {
  const router = useRouter()
  const noteId = useId()
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [isForcing, setIsForcing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const weekday = weekdayLabel(day)
  const hasOpenShifts = status.openShifts.length > 0
  const hasWaiting = status.pendingRemittances.length > 0

  function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string): void {
    setError(null)
    startTransition(async () => {
      const result = await work()
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(done)
      setNote('')
      setIsForcing(false)
      router.refresh()
    })
  }

  if (close && close.status === 'closed') {
    return <ClosedDay tenantSlug={tenantSlug} close={close} isOwner={isOwner} printHref={printHref} />
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-border lg:col-span-2">
        <h2 className="text-[16px] font-extrabold text-wn-ink">Before you close {weekday}</h2>
        <ul className="divide-y divide-wn-line">
          {hasOpenShifts ? (
            status.openShifts.map((shift) => (
              <Check key={shift.shiftId} tone="block">
                {shift.staffName} is still on {shift.drawerName ?? 'their drawer'} (since {clockLabel(shift.openedAt)}). End {shift.staffName}’s shift
                from the app’s Drawer first.
              </Check>
            ))
          ) : (
            <Check tone="ok">Every shift has ended.</Check>
          )}
          {hasWaiting ? (
            <Check tone="warn">
              {status.pendingRemittances.length} {status.pendingRemittances.length === 1 ? 'remittance is' : 'remittances are'} waiting to be accepted or
              settled.{' '}
              <Link href={`/${encodeURIComponent(tenantSlug)}/admin/cash?tab=accept`} className="font-bold underline underline-offset-2">
                Review
              </Link>
            </Check>
          ) : (
            <Check tone="ok">All cash handed over has been accepted.</Check>
          )}
          {status.nonCashUnchecked.length > 0 ? (
            <Check tone="warn">
              Not checked yet: {status.nonCashUnchecked.map((item) => `${item.method} on ${item.staffName}’s shift`).join(', ')}.
            </Check>
          ) : (
            <Check tone="ok">GCash and cards checked.</Check>
          )}
        </ul>

        {(isForcing || hasWaiting) && !hasOpenShifts && (
          <label htmlFor={noteId} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
            {hasWaiting ? 'Close anyway? Say why' : 'Note (optional)'}
            <textarea id={noteId} rows={3} value={note} maxLength={DAY_CLOSE_NOTE_MAX} onChange={(event) => setNote(event.target.value)} className={`${FIELD_CLASS} py-2`} />
          </label>
        )}

        {error && (
          <p role="alert" className="text-[13.5px] font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!hasWaiting ? (
            <button
              type="button"
              disabled={hasOpenShifts || isPending}
              onClick={() => run(() => closeDayAction(tenantSlug, { outletId, day, note: note.trim() || null, force: false }), `${weekday} is closed.`)}
              className={PRIMARY_BUTTON}
            >
              {isPending ? 'Closing…' : `Close ${weekday}`}
            </button>
          ) : (
            <button
              type="button"
              disabled={hasOpenShifts || isPending || note.trim() === ''}
              onClick={() => run(() => closeDayAction(tenantSlug, { outletId, day, note: note.trim(), force: true }), `${weekday} is closed. The skipped checks are noted.`)}
              className={PRIMARY_BUTTON}
            >
              {isPending ? 'Closing…' : `Close ${weekday} anyway`}
            </button>
          )}
          {!hasWaiting && !isForcing && !hasOpenShifts && (
            <button type="button" onClick={() => setIsForcing(true)} className={SECONDARY_BUTTON}>
              Add a note
            </button>
          )}
        </div>
        {status.existingClose?.status === 'reopened' && (
          <p className="text-[13px] text-wn-stone">This day was reopened. Closing it again keeps the earlier close in the history.</p>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-border lg:col-span-3">
        <h2 className="text-[16px] font-extrabold text-wn-ink">{weekday} so far</h2>
        {status.preview ? (
          <DayCloseSummary snapshot={status.preview} isDrawersOnly={status.preview.sales === null} />
        ) : (
          <p className="text-[14px] text-wn-stone">Adding up {weekday}…</p>
        )}
      </section>
    </div>
  )
}

function ClosedDay({ tenantSlug, close, isOwner, printHref }: { tenantSlug: string; close: DayClose; isOwner: boolean; printHref: string | null }) {
  const router = useRouter()
  const amountId = useId()
  const toId = useId()
  const refId = useId()
  const reasonId = useId()
  const [isPending, startTransition] = useTransition()
  const [amountText, setAmountText] = useState(close.snapshot.cashToAccountForCents === null ? '' : String(close.snapshot.cashToAccountForCents / 100))
  const [to, setTo] = useState('')
  const [ref, setRef] = useState('')
  const [reason, setReason] = useState('')
  const [isReopening, setIsReopening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const weekday = weekdayLabel(close.businessDay)
  const difference = depositDifferenceCents(close)
  const typed = parseFloatPesos(amountText)

  function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string): void {
    setError(null)
    startTransition(async () => {
      const result = await work()
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(done)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-border lg:col-span-2">
        <div>
          <h2 className="text-[16px] font-extrabold text-wn-ink">{weekday} is closed</h2>
          <p className="mt-0.5 text-[13.5px] text-wn-stone">
            By {close.closedByName} at {clockLabel(close.closedAt)}
            {close.version > 1 ? ` · closed ${close.version} times` : ''}
          </p>
          {close.note && <p className="mt-2 text-[13.5px] text-wn-ink">“{close.note}”</p>}
        </div>

        {close.depositRecordedAt ? (
          <div className="rounded-xl bg-wn-sand px-4 py-3 ring-1 ring-wn-line">
            <p className="text-[14px] font-bold text-wn-ink tabular-nums">
              Deposited {formatMoney(close.depositCents, { centavos: true })} · {close.depositTo}
            </p>
            {close.depositRef && <p className="text-[13px] text-wn-stone">Ref {close.depositRef}</p>}
            {difference !== null && difference !== 0 && (
              <p className="mt-1 text-[13px] text-amber-900">
                {formatMoney(Math.abs(difference), { centavos: true })} {difference < 0 ? 'less' : 'more'} than the cash to deposit.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <h3 className="text-[14.5px] font-bold text-wn-ink">Record the deposit</h3>
            <label htmlFor={amountId} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
              Amount (₱)
              <input id={amountId} inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} className={`${FIELD_CLASS} tabular-nums`} />
            </label>
            <label htmlFor={toId} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
              Where it went
              <input id={toId} value={to} maxLength={DEPOSIT_TEXT_MAX} placeholder="BDO savings, or Safe" onChange={(event) => setTo(event.target.value)} className={FIELD_CLASS} />
            </label>
            <label htmlFor={refId} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
              Reference (optional)
              <input id={refId} value={ref} maxLength={DEPOSIT_TEXT_MAX} onChange={(event) => setRef(event.target.value)} className={FIELD_CLASS} />
            </label>
            {typeof typed === 'number' && close.snapshot.cashToAccountForCents !== null && typed !== close.snapshot.cashToAccountForCents && (
              <p className="text-[13px] text-amber-900">
                {formatMoney(Math.abs(typed - close.snapshot.cashToAccountForCents), { centavos: true })}{' '}
                {typed < close.snapshot.cashToAccountForCents ? 'less' : 'more'} than the cash to deposit.
              </p>
            )}
            <button
              type="button"
              disabled={isPending || typeof typed !== 'number' || to.trim() === ''}
              onClick={() =>
                run(
                  () => recordDepositAction(tenantSlug, { closeId: close.id, cents: typed as number, to: to.trim(), ref: ref.trim() || null }),
                  'Deposit recorded.',
                )
              }
              className={PRIMARY_BUTTON}
            >
              {isPending ? 'Saving…' : 'Save deposit'}
            </button>
            <p className="text-[12.5px] text-wn-stone">A deposit slip photo can be added from the app.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-wn-line pt-4">
          {printHref && (
            <Link href={printHref} className={SECONDARY_BUTTON}>
              <Printer className="size-4" aria-hidden />
              Print day close
            </Link>
          )}
          {isOwner && !isReopening && (
            <button type="button" onClick={() => setIsReopening(true)} className={SECONDARY_BUTTON}>
              Reopen {weekday}
            </button>
          )}
        </div>
        {isReopening && (
          <div className="flex flex-col gap-2">
            <label htmlFor={reasonId} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
              Why reopen it? It stays in the history.
              <textarea id={reasonId} rows={2} value={reason} maxLength={REOPEN_REASON_MAX} onChange={(event) => setReason(event.target.value)} className={`${FIELD_CLASS} py-2`} />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending || reason.trim() === ''}
                onClick={() => run(() => reopenDayAction(tenantSlug, { closeId: close.id, reason: reason.trim() }), `${weekday} is open again.`)}
                className={PRIMARY_BUTTON}
              >
                Reopen
              </button>
              <button type="button" onClick={() => setIsReopening(false)} className={SECONDARY_BUTTON}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13.5px] font-medium text-red-700">
            {error}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-border lg:col-span-3">
        <h2 className="text-[16px] font-extrabold text-wn-ink">{weekday} as closed</h2>
        <DayCloseSummary snapshot={close.snapshot} isDrawersOnly={close.salesSource === 'drawers_only'} />
      </section>
    </div>
  )
}
