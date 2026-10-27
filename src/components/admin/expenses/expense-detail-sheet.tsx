'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Ban, Lock, Paperclip, PencilLine, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { getExpense, type ExpenseDb, type ExpenseDetail } from '@/lib/expenses/read/expenses-read'
import type { Expense, ExpenseCategory, ExpenseFlag, Supplier } from '@/lib/expenses/types'
import type { ExpenseDetailsUpdateInput } from '@/lib/expenses/validation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { CategoryBadge, FlagChip, NotExpenseChip, PaidFromLabel, VoidChip } from './expense-badges'
import { formatPeso, longDayLabel, pesoWords, stampLabel } from './expense-format'
import { updateExpenseDetails, voidExpense } from './expense-mutations'
import { EditDetailsForm } from './edit-details-form'
import { ExpenseHistory } from './expense-history'
import { DOC_TYPE_LABELS } from './invoice-details-fields'
import { acceptReceiptFiles } from './receipt-attach'
import { MAX_RECEIPTS_PER_EXPENSE, RECEIPT_ACCEPT, uploadReceipts } from './receipt-client'
import { ReceiptPreviews } from './receipt-previews'
import { keepOpenWhileListOpen } from './combobox'
import { UNKNOWN_SHIFT, readDrawerShift, voidHelperText, type DrawerShift } from './drawer-shift'
import { paidForWords } from './bills/bill-board-model'
import { unlinkExpenseFromBill } from './bills/bill-mutations'
import { BillUnlinkConfirm } from './bills/bill-unlink-confirm'
import { expensesTabHref } from './expenses-tabs'

type DetailState = { kind: 'loading' } | { kind: 'ready'; detail: ExpenseDetail } | { kind: 'failed'; error: string }
type Panel = 'none' | 'void' | 'edit' | 'unlink'

export interface ExpenseDetailSheetProps {
  /** The row that was clicked; null = closed. */
  expense: Expense | null
  onClose: () => void
  tenantId: string
  tenantSlug: string
  categoriesById: ReadonlyMap<string, ExpenseCategory>
  suppliers: readonly Supplier[]
  outletNames: ReadonlyMap<string, string>
  isMultiBranch: boolean
  flagsById: ReadonlyMap<string, readonly ExpenseFlag[]>
  tracksStock: boolean
  /** Bill id → name, for "Paid for: Rent · October". */
  billNames?: ReadonlyMap<string, string>
  onFix: (expense: Expense) => void
}

/** The right-side drawer: the amount, the facts, receipts, history and what can be done (plan §5.4). */
export function ExpenseDetailSheet(props: ExpenseDetailSheetProps) {
  const { expense, onClose } = props
  return (
    <Sheet open={expense !== null} onOpenChange={(isOpen) => (isOpen ? undefined : onClose())}>
      <SheetContent side="right" onEscapeKeyDown={keepOpenWhileListOpen} className="w-full gap-0 overflow-hidden p-0 sm:max-w-[480px]">
        {expense && <DetailBody key={expense.id} {...props} expense={expense} />}
      </SheetContent>
    </Sheet>
  )
}

function DetailBody({
  expense: clicked,
  onClose,
  tenantId,
  tenantSlug,
  categoriesById,
  suppliers,
  outletNames,
  isMultiBranch,
  flagsById,
  tracksStock,
  billNames,
  onFix,
}: ExpenseDetailSheetProps & { expense: Expense }) {
  const router = useRouter()
  const [shownId, setShownId] = useState(clicked.id)
  const [state, setState] = useState<DetailState>({ kind: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const [panel, setPanel] = useState<Panel>('none')
  const [voidReason, setVoidReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const voidInputId = useId()
  const [drawerShift, setDrawerShift] = useState<DrawerShift>(UNKNOWN_SHIFT)

  useEffect(() => {
    let isCurrent = true
    setState({ kind: 'loading' })
    getExpense(createClient() as unknown as ExpenseDb, tenantId, shownId)
      .then((detail) => {
        if (!isCurrent) return
        setState(detail ? { kind: 'ready', detail } : { kind: 'failed', error: 'This expense can’t be found, or your account can’t see it.' })
      })
      .catch((error: unknown) => {
        if (!isCurrent) return
        setState({ kind: 'failed', error: error instanceof Error ? error.message : 'Couldn’t load this expense.' })
      })
    return () => {
      isCurrent = false
    }
  }, [tenantId, shownId, reloadToken])

  // A drawer expense can be voided (cash back in the drawer) only while its shift is open.
  const movementId = state.kind === 'ready' ? state.detail.expense.shiftCashMovementId : clicked.id === shownId ? clicked.shiftCashMovementId : null
  useEffect(() => {
    if (!movementId) {
      setDrawerShift(UNKNOWN_SHIFT)
      return
    }
    let isCurrent = true
    void readDrawerShift(createClient() as unknown as ExpenseDb, movementId).then((shift) => {
      if (isCurrent) setDrawerShift(shift)
    })
    return () => {
      isCurrent = false
    }
  }, [movementId, reloadToken])

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1)
    router.refresh()
  }, [router])

  // Until the full record arrives, the clicked row is enough to show the hero.
  const expense = state.kind === 'ready' ? state.detail.expense : shownId === clicked.id ? clicked : null
  const versions = useMemo(() => (state.kind === 'ready' ? state.detail.history : []), [state])

  async function confirmVoid(): Promise<void> {
    if (!expense) return
    const reason = voidReason.trim()
    if (reason === '') {
      setActionError('Say why you are voiding it. It goes in the history.')
      return
    }
    setIsBusy(true)
    const result = await voidExpense(tenantSlug, expense.id, reason)
    setIsBusy(false)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    toast.success(expense.paidFrom === 'drawer' ? 'Voided. The cash is back in the drawer; the entry stays in the history.' : 'Voided. It stays in the history, struck through.')
    setPanel('none')
    setVoidReason('')
    setActionError(null)
    reload()
  }

  async function saveDetails(update: ExpenseDetailsUpdateInput): Promise<void> {
    setIsBusy(true)
    const result = await updateExpenseDetails(tenantSlug, update)
    setIsBusy(false)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    toast.success('Details saved.')
    setPanel('none')
    setActionError(null)
    reload()
  }

  async function confirmUnlink(): Promise<void> {
    if (!expense) return
    setIsBusy(true)
    const result = await unlinkExpenseFromBill(tenantSlug, expense.id)
    setIsBusy(false)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    toast.success('Taken off the bill. The expense stays in your book.')
    setPanel('none')
    setActionError(null)
    reload()
  }

  async function addReceipts(fileList: FileList | null): Promise<void> {
    if (!expense || !fileList) return
    const existing = state.kind === 'ready' ? state.detail.receipts.length : expense.receiptCount
    const { files, problems } = acceptReceiptFiles(Array.from(fileList), MAX_RECEIPTS_PER_EXPENSE - existing)
    if (problems.length > 0) toast.error(problems[0])
    if (files.length === 0) return
    setIsBusy(true)
    const failures = await uploadReceipts(expense.id, files)
    setIsBusy(false)
    if (failures.length > 0) toast.error(failures[0])
    else toast.success(files.length === 1 ? 'Receipt attached.' : `${files.length} receipts attached.`)
    reload()
  }

  if (!expense) {
    return (
      <div className="flex h-full flex-col gap-3 p-6">
        <SheetTitle className="text-[17px] font-bold text-wn-ink">Expense</SheetTitle>
        <SheetDescription className="text-wn-stone">
          {state.kind === 'failed' ? state.error : 'Loading…'}
        </SheetDescription>
      </div>
    )
  }

  const category = categoriesById.get(expense.categoryId)
  const isVoid = expense.status === 'void'
  const isDrawer = expense.paidFrom === 'drawer'
  // Unknown (unreadable shift) still offers Void; the server refuses a closed shift with a sentence.
  const canVoid = !isDrawer || drawerShift.isOpen !== false
  const drawerVoidHelper = isDrawer ? voidHelperText(formatPeso(expense.amountCents), drawerShift.drawerName) : null
  const flags = flagsById.get(expense.id) ?? []
  const supplier = expense.supplierId ? suppliers.find((entry) => entry.id === expense.supplierId) : undefined
  const paidTo = supplier?.name ?? expense.paidToName
  const branch = expense.outletId ? (outletNames.get(expense.outletId) ?? 'A branch') : 'Whole store'
  const paidFor = expense.billId && expense.billDueOn ? paidForWords(billNames?.get(expense.billId) ?? null, expense.billDueOn) : null
  const hasInvoice = Boolean(
    expense.docType || expense.invoiceNo || expense.supplierTin || expense.vatCents !== null || expense.ewtCents !== null || expense.form2307Given,
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-wn-line px-6 pb-5 pt-6 pr-12">
        <div className="flex items-center gap-3">
          <CategoryBadge category={category} size="lg" />
          <div className="min-w-0">
            <SheetTitle className={cn('truncate text-[16px] font-bold text-wn-ink', isVoid && 'text-wn-stone line-through')}>
              {category?.name ?? 'Expense'}
            </SheetTitle>
            <SheetDescription className="text-[13px] text-wn-stone">{longDayLabel(expense.spentOn)}</SheetDescription>
          </div>
        </div>
        <p
          className={cn(
            'mt-4 text-[36px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-wn-ink',
            isVoid && 'text-wn-stone line-through',
          )}
          aria-label={`${pesoWords(expense.amountCents)}${isVoid ? ', voided' : ''}`}
        >
          {formatPeso(expense.amountCents, { exact: true })}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {isVoid && <VoidChip reason={expense.voidReason} />}
          {category?.group === 'not_expense' && <NotExpenseChip />}
          {!isVoid && flags.map((flag) => <FlagChip key={flag} flag={flag} />)}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <dl className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-4 gap-y-3 text-[14px]">
          <Fact label="Paid from">
            <PaidFromLabel paidFrom={expense.paidFrom} />
          </Fact>
          {isMultiBranch && <Fact label="Branch">{branch}</Fact>}
          <Fact label="Paid to">{paidTo ?? <Muted>Not recorded</Muted>}</Fact>
          <Fact label="Note">{expense.note ?? <Muted>No note</Muted>}</Fact>
          {paidFor && (
            <Fact label="Paid for">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={expensesTabHref(tenantSlug, 'bills', null)}
                  className="font-semibold text-wn-ink underline decoration-wn-line underline-offset-4 outline-none hover:decoration-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
                >
                  {paidFor}
                </Link>
                {!isVoid && panel === 'none' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null)
                      setPanel('unlink')
                    }}
                    className="min-h-9 text-[13px] font-semibold text-wn-stone underline underline-offset-4 outline-none hover:text-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
                  >
                    Not for this bill
                  </button>
                )}
              </span>
            </Fact>
          )}
          {category?.group === 'ingredients' && tracksStock && (
            <Fact label="Stock count">{expense.isStockPurchase ? 'Went into stock' : 'Not added to stock'}</Fact>
          )}
          <Fact label="Recorded">
            {expense.createdByName} · <span className="tabular-nums">{stampLabel(expense.createdAt)}</span>
          </Fact>
        </dl>

        <Section title="Receipts">
          {state.kind === 'loading' && <div className="h-24 animate-pulse rounded-xl bg-wn-sand" aria-label="Loading receipts" />}
          {state.kind === 'ready' && state.detail.receipts.length === 0 && (
            <p className="text-[13.5px] text-wn-stone">No receipt yet.</p>
          )}
          {state.kind === 'ready' && <ReceiptPreviews receipts={state.detail.receipts} />}
        </Section>

        {hasInvoice && (
          <Section title="Invoice details">
            <dl className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-4 gap-y-2.5 text-[14px]">
              {expense.docType && <Fact label="Document">{DOC_TYPE_LABELS[expense.docType]}</Fact>}
              {expense.invoiceNo && <Fact label="Invoice no.">{expense.invoiceNo}</Fact>}
              {expense.supplierTin && <Fact label="Supplier TIN"><span className="tabular-nums">{expense.supplierTin}</span></Fact>}
              {expense.vatCents !== null && (
                <Fact label="VAT"><span className="tabular-nums">{formatPeso(expense.vatCents, { exact: true })}</span></Fact>
              )}
              {expense.ewtCents !== null && (
                <Fact label="Withheld">
                  <span className="tabular-nums">
                    {formatPeso(expense.ewtCents, { exact: true })}
                    {expense.ewtRate !== null ? ` · ${expense.ewtRate}%` : ''}
                  </span>
                </Fact>
              )}
              <Fact label="Form 2307">{expense.form2307Given ? 'Given' : 'Not given'}</Fact>
            </dl>
          </Section>
        )}

        <Section title="History">
          <ExpenseHistory
            expense={expense}
            versions={versions}
            categoriesById={categoriesById}
            onOpenVersion={(id) => {
              setPanel('none')
              setShownId(id)
            }}
          />
        </Section>

        {panel === 'edit' && (
          <Section title="Edit details">
            <EditDetailsForm
              expense={expense}
              category={category}
              suppliers={suppliers}
              isSaving={isBusy}
              error={actionError}
              onCancel={() => {
                setPanel('none')
                setActionError(null)
              }}
              onSave={(update) => void saveDetails(update)}
            />
          </Section>
        )}

        {panel === 'unlink' && paidFor && (
          <Section title="Not for this bill">
            <BillUnlinkConfirm
              paidFor={paidFor}
              isBusy={isBusy}
              error={actionError}
              onCancel={() => {
                setPanel('none')
                setActionError(null)
              }}
              onConfirm={() => void confirmUnlink()}
            />
          </Section>
        )}

        {panel === 'void' && (
          <Section title="Void this expense">
            <div className="flex flex-col gap-2">
              <label htmlFor={voidInputId} className="text-[13px] font-semibold text-wn-ink">
                Why? It stays in the history, struck through.
              </label>
              {drawerVoidHelper && <p className="text-[12.5px] text-wn-stone">{drawerVoidHelper}</p>}
              <input
                id={voidInputId}
                type="text"
                autoFocus
                maxLength={200}
                value={voidReason}
                placeholder="e.g. Entered twice"
                aria-invalid={actionError ? true : undefined}
                onChange={(event) => {
                  setVoidReason(event.target.value)
                  setActionError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void confirmVoid()
                  }
                }}
                className="h-11 w-full rounded-xl border border-wn-line bg-white px-3 text-[15px] text-wn-ink outline-none focus-visible:border-wn-ink focus-visible:ring-[3px] focus-visible:ring-wn-ink/15"
              />
              {actionError && (
                <p role="alert" className="text-[12.5px] font-semibold text-red-800">
                  {actionError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPanel('none')} className={SECONDARY_BUTTON}>
                  Keep it
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void confirmVoid()}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-wn-ink px-5 text-[14px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:opacity-70"
                >
                  <Ban className="size-4" aria-hidden />
                  {isBusy ? 'Voiding…' : 'Void expense'}
                </button>
              </div>
            </div>
          </Section>
        )}
      </div>

      {!isVoid && panel === 'none' && (
        <footer className="flex flex-col gap-2 border-t border-wn-line bg-white px-6 py-4">
          {isDrawer && drawerShift.isOpen === false && (
            <p className="flex gap-1.5 text-[12.5px] leading-snug text-wn-stone">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              This shift is closed, so the cash can’t go back in the drawer. Use Fix to change what it was for, e.g. “Owner took cash”.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onFix(expense)} className={PRIMARY_BUTTON}>
              <Wrench className="size-4" aria-hidden />
              Fix
            </button>
            <button type="button" onClick={() => setPanel('edit')} className={SECONDARY_BUTTON}>
              <PencilLine className="size-4" aria-hidden />
              Edit details
            </button>
            <button type="button" disabled={isBusy} onClick={() => fileInputRef.current?.click()} className={SECONDARY_BUTTON}>
              <Paperclip className="size-4" aria-hidden />
              {isBusy ? 'Attaching…' : 'Add receipt'}
            </button>
            {canVoid && (
              <button type="button" onClick={() => setPanel('void')} className={cn(SECONDARY_BUTTON, 'ml-auto')}>
                <Ban className="size-4" aria-hidden />
                Void
              </button>
            )}
          </div>
          {drawerVoidHelper && canVoid && <p className="text-[12.5px] leading-snug text-wn-stone">{drawerVoidHelper}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept={RECEIPT_ACCEPT}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              void addReceipts(event.target.files)
              event.target.value = ''
            }}
          />
        </footer>
      )}
      {isVoid && (
        <footer className="border-t border-wn-line px-6 py-4">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Close
          </button>
        </footer>
      )}
    </div>
  )
}

const PRIMARY_BUTTON =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full bg-wn-ink px-4 text-[14px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2'
const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[14px] font-bold text-wn-ink ring-1 ring-wn-line outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-60'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-wn-stone">{label}</dt>
      <dd className="min-w-0 break-words text-wn-ink">{children}</dd>
    </>
  )
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-wn-stone">{children}</span>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-wn-line pt-5">
      <h3 className="mb-3 text-[13px] font-bold text-wn-ink">{title}</h3>
      {children}
    </section>
  )
}
