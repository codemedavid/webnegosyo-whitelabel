'use client'

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { BILL_PRESETS, type Bill, type BillDraftField, type BillPayment } from '@/lib/expenses/bill-schedule'
import type { Expense, ExpenseCategory, Supplier } from '@/lib/expenses/types'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { keepOpenWhileListOpen } from '../combobox'
import { AmountField, BranchField, FIELD_INPUT, FIELD_LABEL, FieldError, PaidFromField } from '../expense-form-fields'
import { CategoryPicker, SupplierPicker } from '../pickers'
import {
  REMIND_OPTIONS,
  applyPreset,
  billableCategories,
  blankEditor,
  draftOf,
  editorFromBill,
  editorProblem,
  findPreset,
  previewDates,
  remindLabel,
  type BillEditorState,
  type EditorProblem,
} from './bill-editor-model'
import { HowOftenFields, SelectField } from './bill-editor-fields'
import { createBill, updateBill } from './bill-mutations'

export interface BillEditorDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  tenantSlug: string
  /** Edit this bill (next occurrences only); null = add a new one. */
  bill: Bill | null
  /** Add: start from this preset (the empty state's buttons). */
  presetKey?: string | null
  categories: readonly ExpenseCategory[]
  suppliers: readonly Supplier[]
  outlets: readonly { id: string; name: string }[]
  isMultiBranch: boolean
  lockedOutletId: string | null
  lockedBranchLabel: string | null
  recentExpenses: readonly Expense[]
  payments: readonly BillPayment[]
  today: string
}

export function BillEditorDialog(props: BillEditorDialogProps) {
  const { isOpen, onOpenChange, bill, presetKey } = props
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(94dvh,880px)] flex-col gap-0 overflow-hidden rounded-2xl border-wn-line p-0 sm:max-w-[600px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={keepOpenWhileListOpen}
      >
        {isOpen && <BillForm key={bill?.id ?? `new-${presetKey ?? ''}`} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

/** Where each draft field's message shows, and what gets focus. */
const FIELD_INPUT_SUFFIX: Readonly<Record<BillDraftField, string>> = {
  name: 'name',
  categoryId: 'category',
  amountCents: 'amount',
  rule: 'repeat',
  startsOn: 'starts',
  endsOn: 'starts',
  remindDaysBefore: 'remind',
  paidFrom: 'name',
  paidToName: 'paid-to',
}

function initialState({ bill, presetKey, categories, today, lockedOutletId }: BillEditorDialogProps): BillEditorState {
  if (bill) return editorFromBill(bill)
  const blank = blankEditor(today, lockedOutletId)
  const preset = presetKey ? findPreset(presetKey) : undefined
  return preset ? applyPreset(blank, preset, categories) : blank
}

function BillForm(props: BillEditorDialogProps) {
  const { onOpenChange, tenantSlug, bill, categories, suppliers, outlets, isMultiBranch, lockedOutletId, lockedBranchLabel, recentExpenses, payments, today } = props
  const idPrefix = useId().replace(/:/g, '')
  const nameRef = useRef<HTMLInputElement>(null)
  const isSavingRef = useRef(false)
  const [state, setState] = useState<BillEditorState>(() => initialState(props))
  const [problem, setProblem] = useState<EditorProblem | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const offered = useMemo(() => billableCategories(categories, state.categoryId), [categories, state.categoryId])
  const preview = previewDates(state, today, bill?.id, payments)
  const errorFor = (field: BillDraftField): string | null => (problem?.field === field ? problem.message : null)
  const fieldId = (suffix: string): string => `${idPrefix}-${suffix}`

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  function update(patch: Partial<BillEditorState>): void {
    setState((current) => ({ ...current, ...patch }))
    setProblem(null)
    setSubmitError(null)
  }

  function pickPreset(key: string): void {
    const preset = findPreset(key)
    if (!preset) return
    setState((current) => applyPreset(current, preset, categories))
    setProblem(null)
    if (key === 'other') nameRef.current?.focus()
  }

  async function save(): Promise<void> {
    if (isSavingRef.current) return
    const found = editorProblem(state, categoriesById, today, bill?.startsOn ?? null)
    setProblem(found)
    setSubmitError(null)
    if (found) {
      document.getElementById(fieldId(FIELD_INPUT_SUFFIX[found.field]))?.focus()
      return
    }
    isSavingRef.current = true
    setIsSaving(true)
    const draft = draftOf(state)
    const result = bill ? await updateBill(tenantSlug, bill.id, draft) : await createBill(tenantSlug, draft)
    isSavingRef.current = false
    setIsSaving(false)
    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    toast.success(bill ? `Saved · ${draft.name}. Past payments stay as they are.` : `Added · ${draft.name}. We’ll remind you before it’s due.`)
    onOpenChange(false)
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

  return (
    <form noValidate onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-wn-line px-6 pb-4 pt-5 pr-12">
        <DialogTitle className="text-[19px] font-extrabold tracking-[-0.01em] text-wn-ink">{bill ? `Edit ${bill.name}` : 'New bill'}</DialogTitle>
        <DialogDescription className="mt-1 text-[13.5px] text-wn-stone">
          {bill
            ? 'Changes apply from the next due date. Past payments stay in Expenses as they are.'
            : 'A bill is a reminder. It counts in Profit only when you mark it paid.'}
        </DialogDescription>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-4">
          {!bill && (
            <div role="group" aria-label="Start from" className="flex flex-wrap gap-1.5">
              {BILL_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  aria-pressed={state.presetKey === preset.key}
                  onClick={() => pickPreset(preset.key)}
                  className={cn(
                    'inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] font-semibold ring-1 outline-none focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2',
                    state.presetKey === preset.key ? 'bg-wn-ink text-white ring-wn-ink' : 'bg-white text-wn-ink ring-wn-line hover:ring-wn-ink/50',
                  )}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={fieldId('name')} className={FIELD_LABEL}>
              Name
            </label>
            <input
              ref={nameRef}
              id={fieldId('name')}
              type="text"
              maxLength={80}
              value={state.name}
              placeholder="e.g. Rent, Kuryente, Sahod"
              aria-invalid={errorFor('name') ? true : undefined}
              aria-describedby={errorFor('name') ? `${fieldId('name')}-error` : undefined}
              onChange={(event) => update({ name: event.target.value })}
              className={FIELD_INPUT}
            />
            <FieldError id={`${fieldId('name')}-error`} message={errorFor('name')} />
          </div>

          <CategoryPicker
            inputId={fieldId('category')}
            label="Category"
            categories={offered}
            recentExpenses={recentExpenses}
            value={state.categoryId}
            onChange={(categoryId) => update({ categoryId })}
            error={errorFor('categoryId')}
          />

          <AmountMode idPrefix={idPrefix} value={state.amountMode} onChange={(amountMode) => update({ amountMode })} />
          {state.amountMode === 'fixed' ? (
            <AmountField
              inputId={fieldId('amount')}
              value={state.amountText}
              onChange={(amountText) => update({ amountText })}
              error={errorFor('amountCents')}
            />
          ) : (
            <p className="-mt-2 text-[13px] text-wn-stone">We’ll show about how much, from what you paid the last 3 times.</p>
          )}

          <HowOftenFields
            idPrefix={idPrefix}
            state={state}
            onChange={update}
            error={errorFor('rule')}
            preview={preview}
            today={today}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id={fieldId('remind')}
              label="Remind me"
              value={String(state.remindDaysBefore)}
              onChange={(value) => update({ remindDaysBefore: Number(value) })}
              error={errorFor('remindDaysBefore')}
            >
              {REMIND_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {remindLabel(days)}
                </option>
              ))}
            </SelectField>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('starts')} className={FIELD_LABEL}>
                Starts on
              </label>
              <input
                id={fieldId('starts')}
                type="date"
                value={state.startsOn}
                aria-invalid={errorFor('startsOn') || errorFor('endsOn') ? true : undefined}
                aria-describedby={errorFor('startsOn') || errorFor('endsOn') ? `${fieldId('starts')}-error` : undefined}
                onChange={(event) => update({ startsOn: event.target.value })}
                className={cn(FIELD_INPUT, 'tabular-nums')}
              />
              <FieldError id={`${fieldId('starts')}-error`} message={errorFor('startsOn') ?? errorFor('endsOn')} />
            </div>
          </div>

          <PaidFromField value={state.paidFrom} onChange={(paidFrom) => update({ paidFrom })} />
          {errorFor('paidFrom') && <FieldError id={`${fieldId('paid-from')}-error`} message={errorFor('paidFrom')} />}

          <SupplierPicker
            inputId={fieldId('paid-to')}
            suppliers={suppliers}
            supplierId={state.supplierId}
            paidToName={state.paidToName}
            onPickSupplier={(supplier) => update({ supplierId: supplier.id, paidToName: '' })}
            onTypeName={(paidToName) => update({ paidToName, supplierId: null })}
          />
          {errorFor('paidToName') && <FieldError id={`${fieldId('paid-to')}-error`} message={errorFor('paidToName')} />}

          {isMultiBranch && (
            <BranchField
              outlets={outlets}
              value={state.outletId}
              onChange={(outletId) => update({ outletId })}
              lockedLabel={lockedOutletId ? (lockedBranchLabel ?? 'Your branch') : null}
            />
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
            <kbd className="rounded border border-wn-line bg-wn-sand px-1.5 py-0.5 font-sans text-[11.5px] font-semibold">⌘ Enter</kbd> saves
          </p>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-bold text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              aria-busy={isSaving || undefined}
              className="inline-flex min-h-11 min-w-32 items-center justify-center rounded-full bg-wn-ink px-5 text-[14.5px] font-bold text-white outline-none transition-colors hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              {isSaving ? 'Saving…' : bill ? 'Save changes' : 'Add bill'}
            </button>
          </div>
        </div>
      </footer>
    </form>
  )
}

/** "Same every time" / "Changes every time" (a radio group: arrow keys move). */
function AmountMode({ idPrefix, value, onChange }: { idPrefix: string; value: BillEditorState['amountMode']; onChange: (value: BillEditorState['amountMode']) => void }) {
  const options = [
    { value: 'fixed', label: 'Same every time' },
    { value: 'varies', label: 'Changes every time' },
  ] as const
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={cn(FIELD_LABEL, 'mb-1.5')}>How much</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const isChecked = option.value === value
          return (
            <label
              key={option.value}
              className={cn(
                'inline-flex min-h-10 cursor-pointer items-center rounded-full px-3.5 text-[13.5px] font-semibold ring-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-wn-ink has-[:focus-visible]:ring-offset-2',
                isChecked ? 'bg-wn-ink text-white ring-wn-ink' : 'bg-white text-wn-ink ring-wn-line hover:ring-wn-ink/50',
              )}
            >
              <input
                type="radio"
                name={`${idPrefix}-amount-mode`}
                value={option.value}
                checked={isChecked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
