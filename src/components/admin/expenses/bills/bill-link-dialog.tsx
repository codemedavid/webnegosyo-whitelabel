'use client'

import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Bill } from '@/lib/expenses/bill-schedule'
import type { Expense } from '@/lib/expenses/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PaidFromLabel } from '../expense-badges'
import { dayLabel, formatPeso, pesoWords } from '../expense-format'
import { LINK_WINDOW_DAYS, linkCandidates, paidForWords, shortDate } from './bill-board-model'
import { linkExpenseToBill } from './bill-mutations'

export interface BillLinkTarget {
  bill: Bill
  dueOn: string
}

interface BillLinkDialogProps {
  target: BillLinkTarget | null
  onClose: () => void
  tenantSlug: string
  expenses: readonly Expense[]
  supplierNames: ReadonlyMap<string, string>
  categoryName: (categoryId: string) => string
  today: string
}

/**
 * "I already recorded it": the owner paid and wrote it down as a plain
 * expense. Linking files that expense as this due date's payment; no new row,
 * and the money never changes.
 */
export function BillLinkDialog({ target, onClose, ...rest }: BillLinkDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(isOpen) => (isOpen ? undefined : onClose())}>
      <DialogContent showCloseButton className="flex max-h-[min(90dvh,720px)] flex-col gap-0 overflow-hidden rounded-2xl border-wn-line p-0 sm:max-w-[520px]">
        {target && <LinkBody key={`${target.bill.id}-${target.dueOn}`} target={target} onClose={onClose} {...rest} />}
      </DialogContent>
    </Dialog>
  )
}

function LinkBody({ target, onClose, tenantSlug, expenses, supplierNames, categoryName, today }: BillLinkDialogProps & { target: BillLinkTarget }) {
  const { bill, dueOn } = target
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const candidates = useMemo(() => linkCandidates(expenses, bill, dueOn), [expenses, bill, dueOn])
  const category = categoryName(bill.categoryId)

  async function link(expense: Expense): Promise<void> {
    if (busyId) return
    setBusyId(expense.id)
    setError(null)
    const result = await linkExpenseToBill(tenantSlug, expense.id, bill.id, dueOn)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(`Filed as ${paidForWords(bill.name, dueOn)}. Nothing new was added to Expenses.`)
    onClose()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-wn-line px-6 pb-4 pt-5 pr-12">
        <DialogTitle className="text-[19px] font-extrabold tracking-[-0.01em] text-wn-ink">Which one paid {bill.name}?</DialogTitle>
        <DialogDescription className="mt-1 text-[13.5px] text-wn-stone">
          {category} expenses within {LINK_WINDOW_DAYS} days of {shortDate(dueOn)} that aren’t filed under a bill yet.
        </DialogDescription>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {candidates.length === 0 ? (
          <p className="px-3 py-6 text-center text-[14px] leading-snug text-wn-stone">
            No {category} expense near {shortDate(dueOn)}. Close this and use Mark paid to record it.
          </p>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="Recorded expenses">
            {candidates.map((expense) => {
              const payee = expense.supplierId ? (supplierNames.get(expense.supplierId) ?? expense.paidToName) : expense.paidToName
              const words = `${dayLabel(expense.spentOn, today)}, ${pesoWords(expense.amountCents)}`
              return (
                <li key={expense.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-wn-sand/70">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-wn-ink">
                      {dayLabel(expense.spentOn, today)} · <span className="tabular-nums">{formatPeso(expense.amountCents)}</span>
                    </p>
                    <p className="truncate text-[12.5px] text-wn-stone">
                      {[expense.note?.trim(), payee].filter(Boolean).join(' · ') || <PaidFromLabel paidFrom={expense.paidFrom} />}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    aria-label={`This one: ${words}`}
                    onClick={() => void link(expense)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-wn-ink px-4 text-[13.5px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    <Link2 className="size-4" aria-hidden />
                    {busyId === expense.id ? 'Filing…' : 'This one'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <footer className="flex flex-col gap-2 border-t border-wn-line px-6 py-4">
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-red-800">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center self-end rounded-full px-4 text-[14px] font-bold text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
        >
          Cancel
        </button>
      </footer>
    </div>
  )
}
