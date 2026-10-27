'use client'

import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { asCashRpcClient, type CashResult } from '@/lib/cash/cash-rpc'
import { reasonLabel } from '@/lib/cash/reasons'
import { readShiftSales, type ShiftSalesReport } from '@/lib/cash/shift-sales'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { formatMoney, shiftTimesLabel, verdictPill, type VerdictTone } from './cash-format'
import { ShiftSalesReportView } from './shift-sales-report'
import { remitStatus, salesCellText, type ShiftSalesFigures, type ShiftTableRow } from './shifts-model'

const PILL_TONES: Readonly<Record<VerdictTone, string>> = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  bad: 'bg-red-50 text-red-800 ring-red-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  muted: 'bg-wn-sand text-wn-stone ring-wn-line',
}

function Pill({ text, tone }: { text: string; tone: VerdictTone }) {
  return (
    <span className={cn('inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-bold ring-1', PILL_TONES[tone])}>
      {text}
    </span>
  )
}

function RemitPill({ row }: { row: ShiftTableRow }) {
  const status = remitStatus(row.remittance, row.shift.status === 'open')
  return <Pill text={status.text} tone={status.tone} />
}

function MoneyCell({ sales, pick }: { sales: ShiftSalesFigures; pick: 'netCents' | 'cashCents' | 'nonCashCents' }) {
  const text = salesCellText(sales)
  if (text !== null) return <span className="text-[12.5px] font-medium text-wn-stone">{text}</span>
  return <span>{sales.kind === 'ready' ? formatMoney(sales[pick]) : null}</span>
}

export interface ShiftsTableProps {
  rows: ShiftTableRow[]
  /** id → branch name, shown when the page reads every branch. */
  outletNames: Record<string, string>
  showBranch: boolean
}

export function ShiftsTable({ rows, outletNames, showBranch }: ShiftsTableProps) {
  const [selected, setSelected] = useState<ShiftTableRow | null>(null)
  return (
    <>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-border">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <caption className="sr-only">Shifts on this business day. Select a row to see its sales.</caption>
          <thead>
            <tr className="border-b border-wn-line text-[12px] font-bold uppercase tracking-[0.08em] text-wn-stone">
              <th scope="col" className="px-4 py-3">Cashier</th>
              <th scope="col" className="px-3 py-3">Shift</th>
              <th scope="col" className="px-3 py-3 text-right">Net sales</th>
              <th scope="col" className="px-3 py-3 text-right">Cash</th>
              <th scope="col" className="px-3 py-3 text-right">Non-cash</th>
              <th scope="col" className="px-3 py-3 text-right">Counted</th>
              <th scope="col" className="px-3 py-3">Result</th>
              <th scope="col" className="px-3 py-3">Remit</th>
              <th scope="col" className="w-8 px-2 py-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="text-[14px] tabular-nums text-wn-ink">
            {rows.map((row) => {
              const pill = verdictPill(row.verdict)
              const { shift } = row
              const branch = showBranch && shift.outletId ? outletNames[shift.outletId] : null
              return (
                <tr
                  key={shift.id}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer border-b border-wn-line last:border-b-0 hover:bg-wn-sand/60"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelected(row)
                      }}
                      className="rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-wn-ink"
                    >
                      <span className="block font-bold">{shift.staffName}</span>
                      <span className="block text-[12.5px] text-wn-stone">
                        {[shift.drawerName ?? 'Own drawer', branch].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block whitespace-nowrap">{shiftTimesLabel(shift.openedAt, shift.closedAt)}</span>
                    {row.periodName && <span className="block text-[12.5px] text-wn-stone">{row.periodName}</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold"><MoneyCell sales={row.sales} pick="netCents" /></td>
                  <td className="px-3 py-3 text-right"><MoneyCell sales={row.sales} pick="cashCents" /></td>
                  <td className="px-3 py-3 text-right"><MoneyCell sales={row.sales} pick="nonCashCents" /></td>
                  <td className="px-3 py-3 text-right">
                    {shift.countedCents === null ? <span className="text-wn-stone">—</span> : formatMoney(shift.countedCents, { centavos: true })}
                    {row.countAttempts !== null && row.countAttempts > 1 && (
                      <span className="block text-[12px] text-wn-stone">Recounted</span>
                    )}
                  </td>
                  <td className="px-3 py-3"><Pill text={pill.text} tone={pill.tone} /></td>
                  <td className="px-3 py-3"><RemitPill row={row} /></td>
                  <td className="px-2 py-3 text-wn-stone"><ChevronRight className="size-4" aria-hidden /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ShiftSalesSheet row={selected} onClose={() => setSelected(null)} />
    </>
  )
}

type SheetState = { kind: 'loading' } | { kind: 'done'; result: CashResult<ShiftSalesReport> }

function ShiftSalesSheet({ row, onClose }: { row: ShiftTableRow | null; onClose: () => void }) {
  return (
    <Sheet open={row !== null} onOpenChange={(isOpen) => (isOpen ? undefined : onClose())}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[480px]">
        {row && <SheetBody key={row.shift.id} row={row} />}
      </SheetContent>
    </Sheet>
  )
}

/** Read fresh through the viewer's own browser session (an open shift keeps selling). */
function SheetBody({ row }: { row: ShiftTableRow }) {
  const [state, setState] = useState<SheetState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const { shift } = row

  useEffect(() => {
    let isCurrent = true
    setState({ kind: 'loading' })
    void readShiftSales(asCashRpcClient(createClient()), shift.id).then((result) => {
      if (isCurrent) setState({ kind: 'done', result })
    })
    return () => {
      isCurrent = false
    }
  }, [shift.id, attempt])

  const pill = verdictPill(row.verdict)
  return (
    <div className="flex flex-col gap-5 px-5 pb-8 pt-6">
      <div className="pr-8">
        <SheetTitle className="text-[22px] font-extrabold tracking-[-0.01em] text-wn-ink">{shift.staffName}</SheetTitle>
        <SheetDescription className="mt-1 text-[13.5px] text-wn-stone tabular-nums">
          {[shift.drawerName ?? 'Own drawer', row.periodName, shiftTimesLabel(shift.openedAt, shift.closedAt)].filter(Boolean).join(' · ')}
        </SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill text={pill.text} tone={pill.tone} />
          {shift.countedCents !== null && (
            <span className="text-[13px] text-wn-stone tabular-nums">Counted {formatMoney(shift.countedCents, { centavos: true })}</span>
          )}
          {shift.expectedCents !== null && (
            <span className="text-[13px] text-wn-stone tabular-nums">· Should have {formatMoney(shift.expectedCents, { centavos: true })}</span>
          )}
          {row.countAttempts !== null && row.countAttempts > 1 && <span className="text-[13px] text-wn-stone">· Counted twice</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RemitPill row={row} />
          {row.remittance && (
            <span className="text-[13px] text-wn-stone tabular-nums">Handed over {formatMoney(row.remittance.handedOverCents, { centavos: true })}</span>
          )}
          {shift.varianceReason && (
            <span className="text-[13px] text-wn-stone">· Reason: {reasonLabel(shift.varianceReason) ?? shift.varianceReason}</span>
          )}
        </div>
      </div>

      {state.kind === 'loading' ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
          <p className="text-[14px] text-wn-stone">Adding up this shift’s sales…</p>
          <div className="h-24 animate-pulse rounded-2xl bg-wn-sand motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-2xl bg-wn-sand motion-reduce:animate-none" />
        </div>
      ) : state.result.ok ? (
        <ShiftSalesReportView report={state.result.data} />
      ) : (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[13.5px] leading-snug text-red-800">
          <p>{state.result.error.message}</p>
          {state.result.error.kind === 'failed' && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-2 inline-flex min-h-10 items-center rounded-full bg-white px-4 text-[13.5px] font-bold text-wn-ink ring-1 ring-red-200 outline-none focus-visible:ring-2 focus-visible:ring-wn-ink"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  )
}
