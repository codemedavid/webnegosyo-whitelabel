'use client'

import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { CircleCheck, Lock, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { addDays } from '@/lib/expenses/manila-date'
import { MAX_DAYS_BACK } from '@/lib/expenses/validation'
import type { Expense, ExpenseCategory, Supplier } from '@/lib/expenses/types'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { AmountField, BranchField, DateField, NoteField, PaidFromField, YesNoField } from './expense-form-fields'
import {
  FIELD_ORDER,
  blankForm,
  buildDraft,
  buildPatch,
  formFromExpense,
  hasErrors,
  validateForm,
  type ExpenseFormState,
  type FormErrors,
  type WebPaidFrom,
} from './expense-form-model'
import { formatPeso } from './expense-format'
import { recordExpense, replaceExpense, saveSupplier, voidExpense } from './expense-mutations'
import { InvoiceDetailsFields } from './invoice-details-fields'
import { CategoryPicker, SupplierPicker } from './pickers'
import { keepOpenWhileListOpen } from './combobox'
import { ReceiptAttach, acceptReceiptFiles } from './receipt-attach'
import { MAX_RECEIPTS_PER_EXPENSE, uploadReceipts } from './receipt-client'

/** How long the "Saved · Undo" toast stays (plan §5.1). */
const UNDO_TOAST_MS = 6000

export interface AddExpenseDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  tenantSlug: string
  categories: readonly ExpenseCategory[]
  suppliers: readonly Supplier[]
  outlets: readonly { id: string; name: string }[]
  isMultiBranch: boolean
  /** A branch-locked account records for its own branch only. */
  lockedOutletId?: string | null
  lockedBranchLabel?: string | null
  /** Recent expenses rank the category picker ("most used"). */
  recentExpenses: readonly Expense[]
  today: string
  /** The store counts stock: ask whether an Ingredients purchase went into it (plan §2.2). */
  tracksStock?: boolean
  /** Fix mode: the expense being replaced (void + corrected copy). */
  fixing?: Expense | null
  /** Add mode: a category picked before opening (a deep link from Profit). */
  initialCategoryId?: string | null
  /** After a save; the page refreshes its data. */
  onSaved?: (expenseId: string) => void
}

/** One id per expense being typed: a retried save returns the first one, never a copy. */
function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function fieldInputId(prefix: string, field: string): string {
  return `${prefix}-${field}`
}

const FIELD_INPUT_SUFFIX: Readonly<Record<string, string>> = {
  amount: 'amount',
  category: 'category',
  spentOn: 'date',
  note: 'note',
  reason: 'reason',
  supplierTin: 'tin',
  vat: 'vat',
  ewtRate: 'ewt-rate',
  ewt: 'ewt',
}

export function AddExpenseDialog(props: AddExpenseDialogProps) {
  const { isOpen, onOpenChange, fixing } = props
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(94dvh,880px)] flex-col gap-0 overflow-hidden rounded-2xl border-wn-line p-0 sm:max-w-[600px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={keepOpenWhileListOpen}
      >
        {/* Remounts per opening (and per expense being fixed), so a form never inherits the last one's state. */}
        {isOpen && <ExpenseForm key={fixing?.id ?? 'new'} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function ExpenseForm({
  onOpenChange,
  tenantSlug,
  categories,
  suppliers,
  outlets,
  isMultiBranch,
  lockedOutletId = null,
  lockedBranchLabel = null,
  recentExpenses,
  today,
  tracksStock = false,
  fixing = null,
  initialCategoryId = null,
  onSaved,
}: AddExpenseDialogProps) {
  const idPrefix = useId().replace(/:/g, '')
  const mode = fixing ? 'fix' : 'add'
  const isDrawerFix = fixing?.paidFrom === 'drawer'
  const amountRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<ExpenseFormState>(() =>
    fixing ? formFromExpense(fixing) : { ...blankForm({ today, outletId: lockedOutletId }), categoryId: initialCategoryId },
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [requestId, setRequestId] = useState(newRequestId)
  const [files, setFiles] = useState<File[]>([])
  const [fileProblems, setFileProblems] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [localSuppliers, setLocalSuppliers] = useState<readonly Supplier[]>(suppliers)

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const category = form.categoryId ? categoriesById.get(form.categoryId) : undefined
  const preview = validateForm(form, { categoriesById, nowMs: Date.now(), mode })
  const amountCents = preview.amountCents
  const isIngredient = category?.group === 'ingredients'
  const hasInvoiceDetails = Boolean(
    form.docType || form.invoiceNo || form.supplierTin || form.vatText || form.ewtText || form.ewtRateText || form.form2307Given,
  )

  useEffect(() => {
    if (!isDrawerFix) amountRef.current?.focus()
  }, [isDrawerFix])

  function update(patch: Partial<ExpenseFormState>): void {
    setForm((current) => ({ ...current, ...patch }))
    // An error clears as soon as its field changes; the rest wait for the next save.
    const touched = Object.keys(patch)
    setErrors((current) => {
      const next = { ...current }
      if (touched.includes('amountText')) delete next.amount
      if (touched.includes('categoryId')) {
        delete next.category
        delete next.note
      }
      if (touched.includes('note')) delete next.note
      if (touched.includes('spentOn')) delete next.spentOn
      if (touched.includes('reason')) delete next.reason
      if (touched.includes('supplierTin')) delete next.supplierTin
      if (touched.includes('vatText')) delete next.vat
      if (touched.includes('ewtText')) delete next.ewt
      if (touched.includes('ewtRateText')) delete next.ewtRate
      return next
    })
  }

  function focusFirstError(found: FormErrors): void {
    const first = FIELD_ORDER.find((field) => found[field])
    if (!first) return
    const element = document.getElementById(fieldInputId(idPrefix, FIELD_INPUT_SUFFIX[first]))
    element?.focus()
  }

  function addFiles(incoming: File[]): void {
    const { files: accepted, problems } = acceptReceiptFiles(incoming, MAX_RECEIPTS_PER_EXPENSE - files.length)
    setFiles((current) => [...current, ...accepted])
    setFileProblems(problems)
  }

  async function createSupplier(name: string): Promise<void> {
    update({ paidToName: name, supplierId: null })
    const result = await saveSupplier(tenantSlug, { name, kind: 'supplier' })
    if (!result.ok) {
      // The name still goes on the expense as typed text.
      toast.error(`Kept “${name}” on this expense, but couldn’t save it as a supplier: ${result.error}`)
      return
    }
    setLocalSuppliers((current) => [...current, result.data])
    update({ supplierId: result.data.id, paidToName: '' })
  }

  async function attachAfterSave(expenseId: string): Promise<void> {
    if (files.length === 0) return
    const failures = await uploadReceipts(expenseId, files)
    if (failures.length > 0) toast.error(`Saved, but a receipt didn’t attach. ${failures[0]} Open the expense to try again.`)
  }

  function offerUndo(expenseId: string, label: string): void {
    toast.success(`Saved · ${label}`, {
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          void voidExpense(tenantSlug, expenseId, 'Undo').then((result) => {
            if (result.ok) {
              toast('Removed. It shows as voided in the history.')
              onSaved?.(expenseId)
            } else {
              toast.error(`Couldn’t undo: ${result.error}`)
            }
          })
        },
      },
    })
  }

  async function save(): Promise<void> {
    if (isSaving) return
    const checked = validateForm(form, { categoriesById, nowMs: Date.now(), mode })
    setErrors(checked.errors)
    setSubmitError(null)
    if (hasErrors(checked.errors) || checked.amountCents === null) {
      focusFirstError(checked.errors)
      return
    }
    const savedAmount = checked.amountCents
    const label = `${category?.name ?? 'Expense'} ${formatPeso(savedAmount)}`
    setIsSaving(true)

    if (fixing) {
      const patch = buildPatch(fixing, form, savedAmount)
      if (Object.keys(patch).length === 0) {
        setIsSaving(false)
        setSubmitError('Nothing changed yet. Change a field, or use Edit details for notes and invoice fields.')
        return
      }
      const result = await replaceExpense(tenantSlug, fixing.id, form.reason.trim(), patch)
      setIsSaving(false)
      if (!result.ok) {
        setSubmitError(result.error)
        return
      }
      await attachAfterSave(result.data.id)
      toast.success(`Fixed · ${label}. The old entry stays in the history.`)
      onSaved?.(result.data.id)
      onOpenChange(false)
      return
    }

    const result = await recordExpense(tenantSlug, buildDraft(form, savedAmount, requestId))
    setIsSaving(false)
    if (!result.ok) {
      // Same request id on retry: the server returns the first save, never a copy.
      setSubmitError(result.error)
      return
    }
    await attachAfterSave(result.data.id)
    offerUndo(result.data.id, label)
    onSaved?.(result.data.id)
    // Stay open for the next one (palengke runs come in batches); keep the date, source and branch.
    setLastSaved(label)
    setForm((current) => ({ ...blankForm({ today, paidFrom: current.paidFrom, outletId: current.outletId }), spentOn: current.spentOn }))
    setErrors({})
    setFiles([])
    setFileProblems([])
    setRequestId(newRequestId())
    amountRef.current?.focus()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void save()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void save()
    }
  }

  function handleDrag(event: DragEvent<HTMLFormElement>, isOver: boolean): void {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return
    event.preventDefault()
    setIsDragging(isOver)
  }

  function handleDrop(event: DragEvent<HTMLFormElement>): void {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return
    event.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  const saveLabel = mode === 'fix' ? 'Save fix' : amountCents !== null ? `Save ${formatPeso(amountCents)}` : 'Save'
  const minDate = addDays(today, -MAX_DAYS_BACK)
  const branchLabel = lockedOutletId ? (lockedBranchLabel ?? 'Your branch') : null

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      onDragEnter={(event) => handleDrag(event, true)}
      onDragOver={(event) => handleDrag(event, true)}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setIsDragging(false)
      }}
      onDrop={handleDrop}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      <header className="border-b border-wn-line px-6 pb-4 pt-5 pr-12">
        <DialogTitle className="text-[19px] font-extrabold tracking-[-0.01em] text-wn-ink">
          {mode === 'fix' ? 'Fix this expense' : 'New expense'}
        </DialogTitle>
        <DialogDescription className="mt-1 text-[13.5px] text-wn-stone">
          {mode === 'fix'
            ? 'We void the old entry and save the corrected one. Both stay in the history.'
            : 'Kung may binayaran ka, idagdag dito. Amount first, then what it was for.'}
        </DialogDescription>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-4">
          {lastSaved && (
            <p role="status" className="flex items-center gap-2 rounded-xl bg-wn-sand px-3.5 py-2.5 text-[13.5px] text-wn-ink ring-1 ring-wn-line">
              <CircleCheck className="size-4 shrink-0 text-wn-ink" aria-hidden />
              <span>
                Saved · <span className="font-semibold tabular-nums">{lastSaved}</span>. Add the next one, or close.
              </span>
            </p>
          )}

          {isDrawerFix && (
            <p className="flex gap-2 rounded-xl bg-wn-sand px-3.5 py-3 text-[13.5px] leading-snug text-wn-ink ring-1 ring-wn-line">
              <Lock className="mt-0.5 size-4 shrink-0 text-wn-stone" aria-hidden />
              <span>
                This cash left a drawer, so the amount, date, branch and source stay as the cashier recorded them. You can
                change what it was for and the details.
              </span>
            </p>
          )}

          <AmountField
            inputId={fieldInputId(idPrefix, 'amount')}
            inputRef={amountRef}
            value={form.amountText}
            onChange={(amountText) => update({ amountText })}
            error={errors.amount}
            isLocked={isDrawerFix}
          />

          <CategoryPicker
            inputId={fieldInputId(idPrefix, 'category')}
            categories={categories}
            recentExpenses={recentExpenses}
            value={form.categoryId}
            onChange={(categoryId) => update({ categoryId })}
            error={errors.category}
            autoFocus={isDrawerFix}
          />

          {isIngredient && tracksStock && (
            <YesNoField
              legend="Did this go into your stock count?"
              hint="Yes if you’ll receive it in Stock, so it isn’t counted twice in Profit."
              value={form.isStockPurchase}
              onChange={(isStockPurchase) => update({ isStockPurchase })}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              inputId={fieldInputId(idPrefix, 'date')}
              value={form.spentOn}
              min={minDate}
              max={today}
              onChange={(spentOn) => update({ spentOn })}
              error={errors.spentOn}
              isLocked={isDrawerFix}
            />
            {isMultiBranch ? (
              <BranchField
                outlets={outlets}
                value={form.outletId}
                onChange={(outletId) => update({ outletId })}
                lockedLabel={branchLabel}
                isLocked={isDrawerFix}
              />
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>

          {isDrawerFix ? (
            <p className="text-[13.5px] text-wn-stone">
              <span className="font-semibold text-wn-ink">Paid from:</span> the cashier’s drawer
            </p>
          ) : (
            <PaidFromField value={form.paidFrom} onChange={(paidFrom: WebPaidFrom) => update({ paidFrom })} />
          )}

          <SupplierPicker
            inputId={fieldInputId(idPrefix, 'paid-to')}
            suppliers={localSuppliers}
            supplierId={form.supplierId}
            paidToName={form.paidToName}
            onPickSupplier={(supplier) =>
              update({
                supplierId: supplier.id,
                paidToName: '',
                ...(supplier.tin && form.supplierTin.trim() === '' ? { supplierTin: supplier.tin } : {}),
                ...(supplier.defaultCategoryId && !form.categoryId ? { categoryId: supplier.defaultCategoryId } : {}),
              })
            }
            onTypeName={(paidToName) => update({ paidToName, supplierId: null })}
            onCreateSupplier={(name) => void createSupplier(name)}
          />

          <NoteField
            inputId={fieldInputId(idPrefix, 'note')}
            value={form.note}
            onChange={(note) => update({ note })}
            isRequired={category?.needsNote === true}
            requiredFor={category?.name}
            error={errors.note}
          />

          <ReceiptAttach
            files={files}
            onAdd={addFiles}
            onRemove={(index) => setFiles((current) => current.filter((_, position) => position !== index))}
            problems={fileProblems}
          />

          <InvoiceDetailsFields
            idPrefix={idPrefix}
            value={form}
            onChange={update}
            amountCents={amountCents}
            errors={errors}
            defaultOpen={hasInvoiceDetails}
          />

          {mode === 'fix' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldInputId(idPrefix, 'reason')} className="text-[13px] font-semibold text-wn-ink">
                Why are you fixing it?
              </label>
              <input
                id={fieldInputId(idPrefix, 'reason')}
                type="text"
                maxLength={200}
                value={form.reason}
                placeholder="e.g. Wrong category"
                aria-invalid={errors.reason ? true : undefined}
                aria-describedby={errors.reason ? `${fieldInputId(idPrefix, 'reason')}-error` : undefined}
                onChange={(event) => update({ reason: event.target.value })}
                className="h-11 w-full rounded-xl border border-wn-line bg-white px-3 text-[15px] text-wn-ink outline-none focus-visible:border-wn-ink focus-visible:ring-[3px] focus-visible:ring-wn-ink/15 aria-[invalid=true]:border-red-700"
              />
              {errors.reason && (
                <p id={`${fieldInputId(idPrefix, 'reason')}-error`} role="alert" className="text-[12.5px] font-semibold text-red-800">
                  {errors.reason}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="flex flex-col gap-2 border-t border-wn-line bg-white px-6 py-4">
        {submitError && (
          <p role="alert" className="text-[13px] font-semibold text-red-800">
            {submitError}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-[12.5px] text-wn-stone sm:block">
            <kbd className="rounded border border-wn-line bg-wn-sand px-1.5 py-0.5 font-sans text-[11.5px] font-semibold">⌘ Enter</kbd> or{' '}
            <kbd className="rounded border border-wn-line bg-wn-sand px-1.5 py-0.5 font-sans text-[11.5px] font-semibold">Ctrl Enter</kbd> saves
          </p>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-bold text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
            >
              {lastSaved ? 'Done' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              aria-busy={isSaving || undefined}
              className={cn(
                'inline-flex min-h-11 min-w-36 items-center justify-center rounded-full bg-wn-ink px-5 text-[14.5px] font-bold tabular-nums text-white outline-none transition-colors hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70',
              )}
            >
              {isSaving ? 'Saving…' : saveLabel}
            </button>
          </div>
        </div>
      </footer>

      {isDragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-wn-ink bg-white/90 text-wn-ink"
        >
          <Upload className="size-6" />
          <p className="text-[15px] font-bold">Drop to attach the receipt</p>
        </div>
      )}
    </form>
  )
}
