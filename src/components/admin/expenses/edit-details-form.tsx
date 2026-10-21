'use client'

import { useId, useMemo, useState } from 'react'
import type { Expense, ExpenseCategory, Supplier } from '@/lib/expenses/types'
import type { ExpenseDetailsUpdateInput } from '@/lib/expenses/validation'
import { NoteField, YesNoField } from './expense-form-fields'
import { buildPatch, formFromExpense, validateForm, type ExpenseFormState, type FormErrors } from './expense-form-model'
import { InvoiceDetailsFields } from './invoice-details-fields'
import { SupplierPicker } from './pickers'

/** Fields that can change in place; money, date, source, branch and category need Fix. */
const EDITABLE_KEYS = [
  'note',
  'supplierId',
  'paidToName',
  'isStockPurchase',
  'docType',
  'invoiceNo',
  'supplierTin',
  'vatCents',
  'ewtCents',
  'ewtRate',
  'form2307Given',
] as const

interface EditDetailsFormProps {
  expense: Expense
  category: ExpenseCategory | undefined
  suppliers: readonly Supplier[]
  tracksStock: boolean
  isSaving: boolean
  error: string | null
  onCancel: () => void
  onSave: (update: ExpenseDetailsUpdateInput) => void
}

/** "Edit details": notes, who was paid and the invoice fields, changed in place and logged. */
export function EditDetailsForm({ expense, category, suppliers, tracksStock, isSaving, error, onCancel, onSave }: EditDetailsFormProps) {
  const idPrefix = useId().replace(/:/g, '')
  const [form, setForm] = useState<ExpenseFormState>(() => formFromExpense(expense))
  const [errors, setErrors] = useState<FormErrors>({})
  const categoriesById = useMemo(() => new Map(category ? [[category.id, category]] : []), [category])
  const update = (patch: Partial<ExpenseFormState>) => setForm((current) => ({ ...current, ...patch }))

  function submit(): void {
    const checked = validateForm(form, { categoriesById, nowMs: Date.now(), mode: 'add' })
    const relevant: FormErrors = {
      ...(checked.errors.note ? { note: checked.errors.note } : {}),
      ...(checked.errors.supplierTin ? { supplierTin: checked.errors.supplierTin } : {}),
      ...(checked.errors.vat ? { vat: checked.errors.vat } : {}),
      ...(checked.errors.ewt ? { ewt: checked.errors.ewt } : {}),
      ...(checked.errors.ewtRate ? { ewtRate: checked.errors.ewtRate } : {}),
    }
    setErrors(relevant)
    if (Object.keys(relevant).length > 0) return
    const patch = buildPatch(expense, form, expense.amountCents)
    const changes = Object.fromEntries(Object.entries(patch).filter(([key]) => (EDITABLE_KEYS as readonly string[]).includes(key)))
    if (Object.keys(changes).length === 0) {
      onCancel()
      return
    }
    onSave({ expenseId: expense.id, ...changes } as ExpenseDetailsUpdateInput)
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          submit()
        }
      }}
      className="flex flex-col gap-4"
    >
      <SupplierPicker
        inputId={`${idPrefix}-paid-to`}
        suppliers={suppliers}
        supplierId={form.supplierId}
        paidToName={form.paidToName}
        onPickSupplier={(supplier) => update({ supplierId: supplier.id, paidToName: '' })}
        onTypeName={(paidToName) => update({ paidToName, supplierId: null })}
      />
      <NoteField
        inputId={`${idPrefix}-note`}
        value={form.note}
        onChange={(note) => update({ note })}
        isRequired={category?.needsNote === true}
        requiredFor={category?.name}
        error={errors.note}
      />
      {category?.group === 'ingredients' && tracksStock && (
        <YesNoField
          legend="Did this go into your stock count?"
          value={form.isStockPurchase}
          onChange={(isStockPurchase) => update({ isStockPurchase })}
        />
      )}
      <InvoiceDetailsFields
        idPrefix={idPrefix}
        value={form}
        onChange={update}
        amountCents={expense.amountCents}
        errors={errors}
        defaultOpen
      />
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-red-800">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-bold text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-11 items-center rounded-full bg-wn-ink px-5 text-[14px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:opacity-70"
        >
          {isSaving ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </form>
  )
}
