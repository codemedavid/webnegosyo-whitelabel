'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { acceptRemittanceAction, disputeRemittanceAction, resolveRemittanceAction } from '@/app/actions/cash'
import { remittanceDifferenceCents, type Remittance } from '@/lib/cash/remittances'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { clockLabel, dayLabel, formatMoney } from './cash-format'
import { parseFloatPesos } from './cash-rules-form'
import { FIELD_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON } from './settings-ui'

type Panel = 'none' | 'different' | 'dispute' | 'resolve'

export interface RemittanceSheetProps {
  remittance: Remittance | null
  onClose: () => void
  tenantSlug: string
  viewerUserId: string
  /** The owner: may settle disputes and receive their own cash. */
  canResolve: boolean
  outletNames: Record<string, string>
}

/** One remittance, as its slip reads, with what the receiver can do (06 §4.4). */
export function RemittanceSheet(props: RemittanceSheetProps) {
  return (
    <Sheet open={props.remittance !== null} onOpenChange={(isOpen) => (isOpen ? undefined : props.onClose())}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[460px]">
        {props.remittance && <SheetBody key={props.remittance.id} {...props} remittance={props.remittance} />}
      </SheetContent>
    </Sheet>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[13.5px] text-wn-stone">{label}</span>
      <span className="text-right text-[14px] font-semibold text-wn-ink tabular-nums">{value}</span>
    </div>
  )
}

const STATUS_WORDS: Readonly<Record<Remittance['status'], string>> = {
  pending: 'Waiting to be accepted',
  accepted: 'Accepted',
  disputed: 'Disputed — waiting for the owner',
  resolved: 'Resolved',
}

function SheetBody({ remittance, onClose, tenantSlug, viewerUserId, canResolve, outletNames }: RemittanceSheetProps & { remittance: Remittance }) {
  const router = useRouter()
  const amountId = useId()
  const noteId = useId()
  const [panel, setPanel] = useState<Panel>('none')
  const [amountText, setAmountText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handedOver = formatMoney(remittance.handedOverCents, { centavos: true })
  const isOwnCash = remittance.cashierUserId === viewerUserId && !canResolve
  const difference = remittanceDifferenceCents(remittance)
  const receiver = remittance.toSafe ? 'Store safe' : (remittance.remittedToName ?? 'Anyone who handles cash')

  function finish(result: { ok: true } | { ok: false; error: string }, message: string): void {
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(message)
    onClose()
    router.refresh()
  }

  function submit(kind: 'same' | Panel): void {
    setError(null)
    const typed = parseFloatPesos(amountText)
    if ((kind === 'different' && (typed === null || typed === undefined)) || (kind === 'dispute' && typed === undefined)) {
      setError('Type the amount you received in pesos, like 6345.')
      return
    }
    startTransition(async () => {
      if (kind === 'same') {
        const result = await acceptRemittanceAction(tenantSlug, {
          id: remittance.id,
          handedOverCents: remittance.handedOverCents,
          receivedCents: remittance.handedOverCents,
          note: null,
        })
        finish(result, `Accepted ${handedOver} from ${remittance.cashierName}.`)
      } else if (kind === 'different') {
        const result = await acceptRemittanceAction(tenantSlug, {
          id: remittance.id,
          handedOverCents: remittance.handedOverCents,
          receivedCents: typed as number,
          note: note.trim() || null,
        })
        finish(result, `Accepted ${formatMoney(typed as number, { centavos: true })}. The difference is noted.`)
      } else if (kind === 'dispute') {
        const result = await disputeRemittanceAction(tenantSlug, { id: remittance.id, reason: note.trim(), receivedCents: typed ?? null })
        finish(result, 'Marked as disputed. The owner will settle it.')
      } else if (kind === 'resolve') {
        const result = await resolveRemittanceAction(tenantSlug, { id: remittance.id, note: note.trim() })
        finish(result, 'Resolved.')
      }
    })
  }

  function open(next: Panel): void {
    setError(null)
    setNote('')
    setAmountText(next === 'different' ? String(remittance.handedOverCents / 100) : '')
    setPanel(next)
  }

  return (
    <div className="flex flex-col gap-5 px-5 pb-8 pt-6">
      <div className="pr-8">
        <SheetTitle className="text-[22px] font-extrabold tracking-[-0.01em] text-wn-ink">
          {remittance.kind === 'pickup' ? 'Cash pickup' : 'End-of-shift remittance'}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[13.5px] text-wn-stone">
          {remittance.cashierName}
          {remittance.outletId && outletNames[remittance.outletId] ? ` · ${outletNames[remittance.outletId]}` : ''}
          {remittance.businessDay ? ` · ${dayLabel(remittance.businessDay)}` : ''} · {clockLabel(remittance.createdAt)}
        </SheetDescription>
      </div>

      <div className="rounded-2xl bg-wn-ink px-5 py-4 text-white">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/70">Handed over</p>
        <p className="mt-1 text-[32px] font-extrabold leading-tight tracking-[-0.02em] tabular-nums">{handedOver}</p>
        <p className="mt-1 text-[13px] text-white/75">To {receiver}</p>
      </div>

      <div className="divide-y divide-wn-line">
        <Fact label="Status" value={STATUS_WORDS[remittance.status]} />
        {remittance.receivedCents !== null && <Fact label="Received" value={formatMoney(remittance.receivedCents, { centavos: true })} />}
        {difference !== null && difference !== 0 && (
          <Fact label="Difference" value={`${formatMoney(Math.abs(difference), { centavos: true })} ${difference < 0 ? 'less' : 'more'}`} />
        )}
        {remittance.receivedByName && (
          <Fact label="Received by" value={`${remittance.receivedByName}${remittance.acceptMethod === 'pin' ? ' (PIN at the counter)' : ''}`} />
        )}
        {remittance.receiverNote && <Fact label="Note" value={remittance.receiverNote} />}
        {remittance.disputeReason && <Fact label="What’s wrong" value={remittance.disputeReason} />}
        {remittance.resolvedNote && <Fact label={`Resolved${remittance.resolvedByName ? ` by ${remittance.resolvedByName}` : ''}`} value={remittance.resolvedNote} />}
      </div>

      {remittance.status === 'pending' && isOwnCash && (
        <p className="rounded-xl bg-wn-sand px-4 py-3 text-[13.5px] text-wn-stone ring-1 ring-wn-line">
          This is your own cash. Someone else who handles cash accepts it.
        </p>
      )}

      {remittance.status === 'pending' && !isOwnCash && panel === 'none' && (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-bold text-wn-ink">
            Did you receive {handedOver} from {remittance.cashierName}?
          </p>
          <button type="button" disabled={isPending} onClick={() => submit('same')} className={PRIMARY_BUTTON}>
            {isPending ? 'Saving…' : `Yes, I received ${handedOver}`}
          </button>
          <button type="button" disabled={isPending} onClick={() => open('different')} className={SECONDARY_BUTTON}>
            I got a different amount
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => open('dispute')}
            className="min-h-11 rounded-full text-[14px] font-bold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-700"
          >
            Something’s wrong
          </button>
        </div>
      )}

      {remittance.status === 'disputed' && canResolve && panel === 'none' && (
        <button type="button" onClick={() => open('resolve')} className={PRIMARY_BUTTON}>
          Settle this
        </button>
      )}
      {remittance.status === 'disputed' && !canResolve && (
        <p className="text-[13.5px] text-wn-stone">Only the owner can settle a disputed remittance.</p>
      )}

      {panel !== 'none' && (
        <div className="flex flex-col gap-3 rounded-xl bg-wn-sand p-4 ring-1 ring-wn-line">
          {(panel === 'different' || panel === 'dispute') && (
            <label htmlFor={amountId} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
              {panel === 'different' ? 'How much did you receive?' : 'How much did you receive? (optional)'}
              <span className="flex items-center gap-1.5">
                <span className="text-[15px] font-bold text-wn-stone" aria-hidden>
                  ₱
                </span>
                <input
                  id={amountId}
                  inputMode="decimal"
                  value={amountText}
                  disabled={isPending}
                  onChange={(event) => setAmountText(event.target.value)}
                  className={`${FIELD_CLASS} w-full tabular-nums`}
                />
              </span>
            </label>
          )}
          <label htmlFor={noteId} className="flex flex-col gap-1 text-[12.5px] font-bold text-wn-stone">
            {panel === 'resolve' ? 'How was it settled?' : panel === 'dispute' ? 'What’s wrong?' : 'What happened?'}
            <textarea
              id={noteId}
              value={note}
              rows={3}
              maxLength={500}
              disabled={isPending}
              onChange={(event) => setNote(event.target.value)}
              className={`${FIELD_CLASS} py-2`}
            />
          </label>
          <p className="text-[12.5px] text-wn-stone">The cashier and the owner will see this.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isPending || note.trim() === ''} onClick={() => submit(panel)} className={PRIMARY_BUTTON}>
              {isPending ? 'Saving…' : panel === 'resolve' ? 'Resolve' : panel === 'dispute' ? 'Mark as disputed' : 'Accept this amount'}
            </button>
            <button type="button" disabled={isPending} onClick={() => setPanel('none')} className={SECONDARY_BUTTON}>
              Back
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[13.5px] font-medium text-red-700">
          {error}
        </p>
      )}
      <p className="text-[12px] text-wn-stone">Not an official receipt. For store use.</p>
    </div>
  )
}
