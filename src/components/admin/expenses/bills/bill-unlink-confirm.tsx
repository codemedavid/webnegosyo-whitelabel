'use client'

import { Unlink } from 'lucide-react'

interface BillUnlinkConfirmProps {
  /** "Rent · October". */
  paidFor: string
  isBusy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

const BUTTON_BASE =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-70'

/**
 * "Not for this bill": undo a wrong "I already recorded it" / Mark paid link.
 * The expense stays in the book exactly as it is (money never changes); only
 * the bill's due date opens again.
 */
export function BillUnlinkConfirm({ paidFor, isBusy, error, onCancel, onConfirm }: BillUnlinkConfirmProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] font-semibold text-wn-ink">This expense isn’t for {paidFor}?</p>
      <p className="text-[13px] leading-snug text-wn-stone">
        It stays in your expenses as it is. {paidFor} shows as not paid yet on Bills to pay.
      </p>
      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-red-800">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${BUTTON_BASE} bg-white text-wn-ink ring-1 ring-wn-line hover:ring-wn-ink`}>
          Keep it
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onConfirm}
          className={`${BUTTON_BASE} bg-wn-ink px-5 text-white hover:bg-wn-ink-raised focus-visible:ring-offset-2`}
        >
          <Unlink className="size-4" aria-hidden />
          {isBusy ? 'Taking it off…' : 'Yes, take it off'}
        </button>
      </div>
    </div>
  )
}
