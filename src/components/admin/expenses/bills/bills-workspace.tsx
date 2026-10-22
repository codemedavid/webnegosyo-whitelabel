'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Bill } from '@/lib/expenses/bill-schedule'
import { cn } from '@/lib/utils'
import { AddExpenseDialog } from '../add-expense-dialog'
import { ExpensesTabs } from '../expenses-tabs'
import { buildBillBoard, payDueOn, paymentPrefill, snoozeDueOns, summaryWords, tomorrowOf, type BillPaymentPrefill, type BoardGroupId, type BoardRow } from './bill-board-model'
import { BillEditorDialog } from './bill-editor-dialog'
import { BillLinkDialog, type BillLinkTarget } from './bill-link-dialog'
import { resumeBill, skipBill, snoozeBill, unmarkBill } from './bill-mutations'
import { BillRow, PausedBillRow, StoppedBillRow, type BillRowAction } from './bill-row'
import { BillStatusDialog, type BillStatusTarget } from './bill-status-dialogs'
import { BillsEmpty } from './bills-empty'
import type { BillsPageData } from './bills-page-data'

/** How long "Nothing to pay this time · Undo" stays. */
const UNDO_TOAST_MS = 6000

interface EditorTarget {
  bill: Bill | null
  presetKey: string | null
}

/**
 * "Bills to pay" (bills-contract §5): what is still to pay this month, then
 * Late / This week / Later / Paid this month. Every bill is a reminder; paying
 * one is an ordinary expense through the Add expense dialog, pre-filled.
 */
export function BillsWorkspace({ data }: { data: BillsPageData }) {
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [paying, setPaying] = useState<BillPaymentPrefill | null>(null)
  const [linkTarget, setLinkTarget] = useState<BillLinkTarget | null>(null)
  const [statusTarget, setStatusTarget] = useState<BillStatusTarget | null>(null)
  const [busyBillId, setBusyBillId] = useState<string | null>(null)

  const board = useMemo(
    () => buildBillBoard({ bills: data.bills, marks: data.marks, payments: data.payments, today: data.today }),
    [data.bills, data.marks, data.payments, data.today],
  )
  const categoriesById = useMemo(() => new Map(data.categories.map((category) => [category.id, category])), [data.categories])
  const supplierNames = useMemo(() => new Map(data.suppliers.map((supplier) => [supplier.id, supplier.name])), [data.suppliers])
  const lateCount = board.groups.find((group) => group.id === 'late')?.rows.length ?? 0

  function branchNameOf(bill: Bill): string | null {
    if (!data.isMultiBranch) return null
    return bill.outletId ? (data.outletNames[bill.outletId] ?? 'Branch') : 'Whole store'
  }

  async function runQuick(bill: Bill, work: () => Promise<string | null>): Promise<void> {
    setBusyBillId(bill.id)
    const error = await work()
    setBusyBillId(null)
    if (error) toast.error(error)
  }

  async function snooze(row: BoardRow): Promise<string | null> {
    const until = tomorrowOf(data.today)
    for (const dueOn of snoozeDueOns(row.occurrence)) {
      const result = await snoozeBill(data.tenantSlug, row.bill.id, dueOn, until)
      if (!result.ok) return result.error
    }
    toast.success(`We’ll remind you about ${row.bill.name} tomorrow.`)
    return null
  }

  async function undoSkip(bill: Bill, dueOn: string): Promise<string | null> {
    const result = await unmarkBill(data.tenantSlug, bill.id, dueOn)
    if (!result.ok) return `Couldn’t undo: ${result.error}`
    toast(`${bill.name} is back on your list.`)
    return null
  }

  async function skip(row: BoardRow): Promise<string | null> {
    const dueOn = payDueOn(row.occurrence)
    const result = await skipBill(data.tenantSlug, row.bill.id, dueOn)
    if (!result.ok) return result.error
    toast.success(`Nothing to pay for ${row.bill.name} this time.`, {
      duration: UNDO_TOAST_MS,
      action: { label: 'Undo', onClick: () => void runQuick(row.bill, () => undoSkip(row.bill, dueOn)) },
    })
    return null
  }

  async function resume(bill: Bill): Promise<string | null> {
    const result = await resumeBill(data.tenantSlug, bill.id)
    if (!result.ok) return result.error
    toast.success(`${bill.name} is back on. We’ll remind you before it’s due.`)
    return null
  }

  function handleBillAction(action: BillRowAction, bill: Bill): void {
    if (action === 'edit') setEditor({ bill, presetKey: null })
    else if (action === 'pause' || action === 'stop') setStatusTarget({ kind: action, bill })
    else if (action === 'resume') void runQuick(bill, () => resume(bill))
  }

  function handleRowAction(action: BillRowAction, row: BoardRow): void {
    const { bill, occurrence } = row
    if (action === 'pay') setPaying(paymentPrefill(bill, occurrence, data.payments, data.today))
    else if (action === 'link') setLinkTarget({ bill, dueOn: payDueOn(occurrence) })
    else if (action === 'snooze') void runQuick(bill, () => snooze(row))
    else if (action === 'skip') void runQuick(bill, () => skip(row))
    else if (action === 'undo_skip') void runQuick(bill, () => undoSkip(bill, occurrence.dueOn))
    else handleBillAction(action, bill)
  }

  const hasBills = data.bills.length > 0
  const hasBoard = board.groups.length > 0 || board.paused.length > 0

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-wn-ink md:text-[30px]">Expenses</h1>
            <p className="mt-1.5 max-w-xl text-[14px] leading-snug text-wn-stone">
              The bills you pay again and again. We remind you; you mark them paid.
            </p>
          </div>
          {hasBills && (
            <button
              type="button"
              onClick={() => setEditor({ bill: null, presetKey: null })}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-wn-ink px-5 text-[14.5px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2"
            >
              <Plus className="size-4" aria-hidden />
              Add bill
            </button>
          )}
        </div>
        <ExpensesTabs tenantSlug={data.tenantSlug} active="bills" monthKey={data.monthKey} lateCount={lateCount} />
      </header>

      {!hasBills ? (
        <BillsEmpty onStart={(presetKey) => setEditor({ bill: null, presetKey })} />
      ) : (
        <>
          <section aria-label="Still to pay" className="rounded-2xl bg-white px-5 py-4 ring-1 ring-border">
            <p className="text-[20px] font-extrabold tracking-[-0.01em] tabular-nums text-wn-ink">
              {summaryWords(board.summary, data.today)}
            </p>
            <p className="mt-1 text-[13px] text-wn-stone">Bills are reminders. Spent and Profit count only what you mark paid.</p>
          </section>

          {!hasBoard && <p className="rounded-2xl bg-white px-5 py-8 text-center text-[14px] text-wn-stone ring-1 ring-border">No bills to pay right now.</p>}

          {board.groups.map((group) => (
            <BoardSection key={group.id} id={group.id} title={group.label} count={group.rows.length} isInitiallyOpen={group.id !== 'paid'}>
              {group.rows.map((row) => (
                <BillRow
                  key={row.key}
                  row={row}
                  category={categoriesById.get(row.bill.categoryId)}
                  branchName={branchNameOf(row.bill)}
                  today={data.today}
                  isBusy={busyBillId === row.bill.id}
                  onAction={handleRowAction}
                />
              ))}
            </BoardSection>
          ))}

          {board.paused.length > 0 && (
            <BoardSection id="paused" title="Paused" count={board.paused.length} isInitiallyOpen>
              {board.paused.map((bill) => (
                <PausedBillRow
                  key={bill.id}
                  bill={bill}
                  category={categoriesById.get(bill.categoryId)}
                  isBusy={busyBillId === bill.id}
                  onAction={handleBillAction}
                />
              ))}
            </BoardSection>
          )}

          {board.stopped.length > 0 && (
            <BoardSection id="stopped" title="Stopped" count={board.stopped.length} isInitiallyOpen={false}>
              {board.stopped.map((bill) => (
                <StoppedBillRow key={bill.id} bill={bill} category={categoriesById.get(bill.categoryId)} />
              ))}
            </BoardSection>
          )}
        </>
      )}

      <BillEditorDialog
        isOpen={editor !== null}
        onOpenChange={(isOpen) => (isOpen ? undefined : setEditor(null))}
        tenantSlug={data.tenantSlug}
        bill={editor?.bill ?? null}
        presetKey={editor?.presetKey ?? null}
        categories={data.categories}
        suppliers={data.suppliers}
        outlets={data.outlets}
        isMultiBranch={data.isMultiBranch}
        lockedOutletId={data.lockedOutletId}
        lockedBranchLabel={data.lockedBranchLabel}
        recentExpenses={data.recentExpenses}
        payments={data.payments}
        today={data.today}
      />

      <AddExpenseDialog
        isOpen={paying !== null}
        onOpenChange={(isOpen) => (isOpen ? undefined : setPaying(null))}
        tenantSlug={data.tenantSlug}
        categories={data.categories}
        suppliers={data.suppliers}
        outlets={data.outlets}
        isMultiBranch={data.isMultiBranch}
        lockedOutletId={data.lockedOutletId}
        lockedBranchLabel={data.lockedBranchLabel}
        recentExpenses={data.recentExpenses}
        today={data.today}
        tracksStock={data.tracksStock}
        billPayment={paying}
      />

      <BillLinkDialog
        target={linkTarget}
        onClose={() => setLinkTarget(null)}
        tenantSlug={data.tenantSlug}
        expenses={data.recentExpenses}
        supplierNames={supplierNames}
        categoryName={(categoryId) => categoriesById.get(categoryId)?.name ?? 'Matching'}
        today={data.today}
      />

      <BillStatusDialog
        target={statusTarget}
        onClose={() => setStatusTarget(null)}
        tenantId={data.tenantId}
        tenantSlug={data.tenantSlug}
        today={data.today}
      />
    </div>
  )
}

interface BoardSectionProps {
  id: BoardGroupId | 'paused' | 'stopped'
  title: string
  count: number
  isInitiallyOpen: boolean
  children: ReactNode
}

/** A folding group: the header is a button (aria-expanded), the rows a list. */
function BoardSection({ id, title, count, isInitiallyOpen, children }: BoardSectionProps) {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen)
  const listId = `bills-${id}`
  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl bg-white ring-1 ring-border">
      <h2>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={() => setIsOpen((current) => !current)}
          className={cn(
            'flex min-h-12 w-full items-center gap-2 px-4 text-left text-[14.5px] font-bold text-wn-ink outline-none hover:bg-wn-sand/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-wn-ink sm:px-5',
            id === 'late' && 'text-red-800',
          )}
        >
          <ChevronDown className={cn('size-4 shrink-0 transition-transform', !isOpen && '-rotate-90')} aria-hidden />
          {title}
          <span className="font-semibold tabular-nums text-wn-stone">{count}</span>
        </button>
      </h2>
      <ul id={listId} hidden={!isOpen} className="divide-y divide-wn-line border-t border-wn-line">
        {children}
      </ul>
    </section>
  )
}
