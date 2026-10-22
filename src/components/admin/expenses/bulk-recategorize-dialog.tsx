'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Expense, ExpenseCategory } from '@/lib/expenses/types'
import { MAX_REASON_LENGTH } from '@/lib/expenses/validation'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FIELD_INPUT, FIELD_LABEL, FieldError } from './expense-form-fields'
import { formatPeso } from './expense-format'
import { replaceExpenseInBulk } from './expense-mutations'
import { CategoryPicker } from './pickers'
import { keepOpenWhileListOpen } from './combobox'

interface BulkRecategorizeDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  tenantSlug: string
  expenses: readonly Expense[]
  categories: readonly ExpenseCategory[]
  recentExpenses: readonly Expense[]
  /** After the batch, with the ids that did NOT move (kept selected for a retry). */
  onDone: (failedIds: string[]) => void
}

/**
 * Re-sort many at once. Money never changes in place, so each one is voided
 * and replaced with the new category, all under ONE reason (plan §5.4).
 */
export function BulkRecategorizeDialog({
  isOpen,
  onOpenChange,
  tenantSlug,
  expenses,
  categories,
  recentExpenses,
  onDone,
}: BulkRecategorizeDialogProps) {
  const reasonId = useId()
  const router = useRouter()
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ category?: string; reason?: string; submit?: string }>({})
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const toMove = categoryId ? expenses.filter((expense) => expense.categoryId !== categoryId) : expenses
  const totalCents = toMove.reduce((sum, expense) => sum + expense.amountCents, 0)

  async function apply(): Promise<void> {
    const trimmed = reason.trim()
    const found = {
      ...(categoryId ? {} : { category: 'Choose the new category.' }),
      ...(trimmed === '' ? { reason: 'Say why. It goes in each one’s history.' } : {}),
      ...(trimmed.length > MAX_REASON_LENGTH ? { reason: `Keep it under ${MAX_REASON_LENGTH} characters.` } : {}),
    }
    setErrors(found)
    if (Object.keys(found).length > 0 || !categoryId) return
    if (toMove.length === 0) {
      setErrors({ submit: 'They are all in that category already.' })
      return
    }
    const target = categories.find((category) => category.id === categoryId)
    const failures: Array<{ id: string; error: string }> = []
    setProgress({ done: 0, total: toMove.length })
    // One at a time: each is its own void + replace, and a failure must not hide the rest.
    for (const [index, expense] of toMove.entries()) {
      // "Went into stock" is an Ingredients answer: it never follows a row into another group.
      const clearsStock = expense.isStockPurchase && target?.group !== 'ingredients'
      const patch = clearsStock ? { categoryId, isStockPurchase: false } : { categoryId }
      const result = await replaceExpenseInBulk(tenantSlug, expense.id, trimmed, patch)
      if (!result.ok) failures.push({ id: expense.id, error: result.error })
      setProgress({ done: index + 1, total: toMove.length })
    }
    setProgress(null)
    // One refresh for the whole batch (each row's action skips its own).
    router.refresh()
    const moved = toMove.length - failures.length
    const name = target?.name ?? 'the new category'
    const failedIds = failures.map((failure) => failure.id)
    if (failures.length === 0) {
      toast.success(`Moved ${moved} to ${name}.`)
      onDone(failedIds)
      onOpenChange(false)
      return
    }
    setErrors({ submit: `${moved} moved, ${failures.length} didn’t: ${failures[0].error} They stay selected so you can try again.` })
    onDone(failedIds)
  }

  const isWorking = progress !== null
  return (
    <Dialog open={isOpen} onOpenChange={(next) => (isWorking ? undefined : onOpenChange(next))}>
      <DialogContent onEscapeKeyDown={keepOpenWhileListOpen} className="flex flex-col gap-0 overflow-visible rounded-2xl border-wn-line p-0 sm:max-w-[520px]">
        <header className="border-b border-wn-line px-6 pb-4 pt-5 pr-12">
          <DialogTitle className="text-[19px] font-extrabold text-wn-ink">Change category</DialogTitle>
          <DialogDescription className="mt-1 text-[13.5px] text-wn-stone">
            {expenses.length} selected. Each one is voided and saved again under the new category; both stay in its history.
          </DialogDescription>
        </header>
        <div className="flex flex-col gap-4 px-6 py-5">
          <CategoryPicker
            label="Move them to"
            categories={categories}
            recentExpenses={recentExpenses}
            value={categoryId}
            onChange={(next) => {
              setCategoryId(next)
              setErrors((current) => ({ ...current, category: undefined, submit: undefined }))
            }}
            error={errors.category}
            autoFocus
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className={FIELD_LABEL}>
              Why?
            </label>
            <input
              id={reasonId}
              type="text"
              value={reason}
              maxLength={MAX_REASON_LENGTH}
              placeholder="e.g. Wrong category"
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={errors.reason ? `${reasonId}-error` : undefined}
              onChange={(event) => {
                setReason(event.target.value)
                setErrors((current) => ({ ...current, reason: undefined }))
              }}
              className={FIELD_INPUT}
            />
            <FieldError id={`${reasonId}-error`} message={errors.reason} />
          </div>
          {categoryId && (
            <p className="text-[13px] tabular-nums text-wn-stone">
              {toMove.length === expenses.length
                ? `${toMove.length} will move · ${formatPeso(totalCents)}`
                : `${toMove.length} will move · ${expenses.length - toMove.length} already there`}
            </p>
          )}
          {errors.submit && (
            <p role="alert" className="text-[13px] font-semibold text-red-800">
              {errors.submit}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-wn-line px-6 py-4">
          {progress && (
            <p role="status" className="mr-auto text-[13px] tabular-nums text-wn-stone">
              Moving {progress.done} of {progress.total}…
            </p>
          )}
          <button
            type="button"
            disabled={isWorking}
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-bold text-wn-ink outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isWorking}
            onClick={() => void apply()}
            className="inline-flex min-h-11 items-center rounded-full bg-wn-ink px-5 text-[14px] font-bold text-white outline-none hover:bg-wn-ink-raised focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:opacity-70"
          >
            {isWorking ? 'Moving…' : `Move ${toMove.length}`}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
