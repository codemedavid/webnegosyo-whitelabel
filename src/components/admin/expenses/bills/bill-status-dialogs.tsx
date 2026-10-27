'use client'

import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { Bill } from '@/lib/expenses/bill-schedule'
import { addDays } from '@/lib/expenses/manila-date'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FIELD_INPUT, FIELD_LABEL } from '../expense-form-fields'
import { shortDate } from './bill-board-model'
import { endBill, pauseBill } from './bill-mutations'
import { countBillPayments, pastPaymentsWords } from './bill-payment-count'

export type BillStatusTarget = { kind: 'pause' | 'stop'; bill: Bill }

interface BillStatusDialogProps {
  target: BillStatusTarget | null
  onClose: () => void
  tenantId: string
  tenantSlug: string
  today: string
}

/** Pause (until a date, or until resumed) and Stop (for good; past payments stay). */
export function BillStatusDialog({ target, onClose, ...rest }: BillStatusDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(isOpen) => (isOpen ? undefined : onClose())}>
      <DialogContent showCloseButton className="gap-0 rounded-2xl border-wn-line p-0 sm:max-w-[460px]">
        {target?.kind === 'pause' && <PauseBody key={target.bill.id} bill={target.bill} onClose={onClose} {...rest} />}
        {target?.kind === 'stop' && <StopBody key={target.bill.id} bill={target.bill} onClose={onClose} {...rest} />}
      </DialogContent>
    </Dialog>
  )
}

interface BodyProps {
  bill: Bill
  onClose: () => void
  tenantId: string
  tenantSlug: string
  today: string
}

function PauseBody({ bill, onClose, tenantSlug, today }: BodyProps) {
  const inputId = useId()
  const [until, setUntil] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const tomorrow = addDays(today, 1)

  async function confirm(): Promise<void> {
    if (until !== '' && until < tomorrow) {
      setError('Pick a day after today, or leave it blank to pause until you resume it.')
      return
    }
    setIsBusy(true)
    const result = await pauseBill(tenantSlug, bill.id, until === '' ? null : until)
    setIsBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(until ? `${bill.name} is paused until ${shortDate(until)}.` : `${bill.name} is paused. Resume it any time.`)
    onClose()
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void confirm()
      }}
      className="flex flex-col gap-4 p-6"
    >
      <div className="pr-6">
        <DialogTitle className="text-[18px] font-extrabold text-wn-ink">Pause {bill.name}?</DialogTitle>
        <DialogDescription className="mt-1 text-[13.5px] leading-snug text-wn-stone">
          No reminders and nothing to pay while it’s paused. Past payments stay in Expenses.
        </DialogDescription>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className={FIELD_LABEL}>
          Resume on <span className="font-normal text-wn-stone">(optional)</span>
        </label>
        <input
          id={inputId}
          type="date"
          min={tomorrow}
          value={until}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setUntil(event.target.value)
            setError(null)
          }}
          className={cn(FIELD_INPUT, 'tabular-nums')}
        />
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-red-800">
          {error}
        </p>
      )}
      <Actions onCancel={onClose} isBusy={isBusy} label={isBusy ? 'Pausing…' : 'Pause bill'} />
    </form>
  )
}

function StopBody({ bill, onClose, tenantId, tenantSlug }: BodyProps) {
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    let isCurrent = true
    void countBillPayments(tenantId, bill.id).then((value) => {
      if (isCurrent) setCount(value)
    })
    return () => {
      isCurrent = false
    }
  }, [tenantId, bill.id])

  async function confirm(): Promise<void> {
    setIsBusy(true)
    const result = await endBill(tenantSlug, bill.id)
    setIsBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(`${bill.name} is stopped. ${pastPaymentsWords(count)}`)
    onClose()
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void confirm()
      }}
      className="flex flex-col gap-4 p-6"
    >
      <div className="pr-6">
        <DialogTitle className="text-[18px] font-extrabold text-wn-ink">Stop {bill.name}?</DialogTitle>
        <DialogDescription className="mt-1 text-[13.5px] leading-snug text-wn-stone">
          {pastPaymentsWords(count)} No more reminders. A stopped bill can’t be restarted; add a new one if it comes back.
        </DialogDescription>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-red-800">
          {error}
        </p>
      )}
      <Actions onCancel={onClose} isBusy={isBusy} label={isBusy ? 'Stopping…' : 'Stop bill'} />
    </form>
  )
}

function Actions({ onCancel, isBusy, label }: { onCancel: () => void; isBusy: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-bold text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
      >
        Keep it
      </button>
      <button
        type="submit"
        disabled={isBusy}
        className="inline-flex min-h-11 items-center rounded-full bg-wn-ink px-5 text-[14px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:opacity-70"
      >
        {label}
      </button>
    </div>
  )
}
