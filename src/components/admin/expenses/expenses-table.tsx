'use client'

import { Fragment, useMemo, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { Expense, ExpenseCategory, ExpenseFlag } from '@/lib/expenses/types'
import { CategoryBadge, FlagChip, NotExpenseChip, PaidFromLabel, VoidChip } from './expense-badges'
import { dayLabel, formatMoneyOut, formatPeso, manilaDayOf, pesoWords, stampLabel, timeLabel } from './expense-format'
import { groupByDay, pageDayGroups, payeeName, type FlagsById } from './expense-list-model'

/** Rows rendered per page; a long month grows by this much at a time. */
export const TABLE_PAGE_SIZE = 150

export interface ExpensesTableProps {
  rows: readonly Expense[]
  categoriesById: ReadonlyMap<string, ExpenseCategory>
  outletNames: ReadonlyMap<string, string>
  /** Supplier id → name, for rows filed against a picked supplier. */
  supplierNames?: ReadonlyMap<string, string>
  flagsById: FlagsById
  today: string
  isMultiBranch: boolean
  selectedIds: ReadonlySet<string>
  onSelectionChange: (next: Set<string>) => void
  onOpen: (expense: Expense) => void
}

/** Only recorded rows can be re-sorted or exported together; a void is history. */
function isSelectable(expense: Expense): boolean {
  return expense.status === 'recorded'
}

function rowTime(expense: Expense): { text: string; title?: string } {
  // A backdated expense was typed later than the day it belongs to: its clock
  // time says nothing about that day, so the row says when it was added.
  if (manilaDayOf(expense.createdAt) !== expense.spentOn) {
    return { text: '—', title: `Added ${stampLabel(expense.createdAt)}` }
  }
  return { text: timeLabel(expense.createdAt) }
}

const TH = 'h-10 bg-wn-sand px-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-wn-stone'

export function ExpensesTable({
  rows,
  categoriesById,
  outletNames,
  supplierNames,
  flagsById,
  today,
  isMultiBranch,
  selectedIds,
  onSelectionChange,
  onOpen,
}: ExpensesTableProps) {
  const [limit, setLimit] = useState(TABLE_PAGE_SIZE)
  const groups = useMemo(() => groupByDay(rows, categoriesById), [rows, categoriesById])
  const page = pageDayGroups(groups, limit)
  const visibleSelectable = page.groups.flatMap((group) => group.rows.filter(isSelectable))
  const selectedVisible = visibleSelectable.filter((expense) => selectedIds.has(expense.id)).length
  const allState: boolean | 'indeterminate' =
    selectedVisible === 0 ? false : selectedVisible === visibleSelectable.length ? true : 'indeterminate'

  function toggleAll(): void {
    const next = new Set(selectedIds)
    if (allState === true) visibleSelectable.forEach((expense) => next.delete(expense.id))
    else visibleSelectable.forEach((expense) => next.add(expense.id))
    onSelectionChange(next)
  }

  function toggleOne(id: string): void {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-border">
      {/* Its own scroll box, so the header and each day's row stay pinned while a long day scrolls. */}
      <div className="max-h-[calc(100dvh-15rem)] min-h-64 overflow-auto overscroll-contain">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[14px]">
          <caption className="sr-only">Expenses, grouped by day, newest first</caption>
          <thead className="sticky top-0 z-20">
            <tr>
              <th scope="col" className={cn(TH, 'w-11 pl-4')}>
                <Checkbox
                  checked={allState}
                  onCheckedChange={toggleAll}
                  disabled={visibleSelectable.length === 0}
                  aria-label="Select every expense shown"
                  className="size-[18px] border-wn-stone/60"
                />
              </th>
              <th scope="col" className={cn(TH, 'w-24')}>Time</th>
              <th scope="col" className={TH}>Category</th>
              <th scope="col" className={TH}>Note / Paid to</th>
              <th scope="col" className={TH}>Paid from</th>
              <th scope="col" className={TH}>By</th>
              <th scope="col" className={cn(TH, 'w-10 text-center')}>
                <Paperclip className="mx-auto size-3.5" aria-hidden />
                <span className="sr-only">Receipt</span>
              </th>
              <th scope="col" className={cn(TH, 'pr-5 text-right')}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {page.groups.map((group) => (
              <Fragment key={group.day}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={7}
                    className="sticky top-10 z-10 border-y border-wn-line bg-[#FBFAF7] px-4 py-2 text-left text-[12.5px] font-bold text-wn-ink"
                  >
                    {dayLabel(group.day, today)}
                  </th>
                  <td className="sticky top-10 z-10 border-y border-wn-line bg-[#FBFAF7] py-2 pr-5 text-right text-[12.5px] font-bold tabular-nums text-wn-ink">
                    <span aria-label={`Spent ${pesoWords(group.totalCents)}`}>{formatPeso(group.totalCents)}</span>
                  </td>
                </tr>
                {group.rows.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    category={categoriesById.get(expense.categoryId)}
                    branchName={isMultiBranch ? (expense.outletId ? (outletNames.get(expense.outletId) ?? 'Branch') : 'Whole store') : null}
                    payee={payeeName(expense, supplierNames)}
                    flags={flagsById.get(expense.id) ?? []}
                    isSelected={selectedIds.has(expense.id)}
                    onToggle={() => toggleOne(expense.id)}
                    onOpen={() => onOpen(expense)}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {page.shown < page.total && (
          <div className="flex items-center justify-center gap-3 border-t border-wn-line px-4 py-4">
            <p className="text-[13px] text-wn-stone tabular-nums">
              Showing {page.shown} of {page.total}
            </p>
            <button
              type="button"
              onClick={() => setLimit((current) => current + TABLE_PAGE_SIZE)}
              className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-[13.5px] font-bold text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
            >
              Show more
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface ExpenseRowProps {
  expense: Expense
  category: ExpenseCategory | undefined
  branchName: string | null
  /** The picked supplier's name, else the typed payee. */
  payee: string | null
  flags: readonly ExpenseFlag[]
  isSelected: boolean
  onToggle: () => void
  onOpen: () => void
}

const TD = 'border-b border-wn-line px-3 py-2.5 align-middle'

function ExpenseRow({ expense, category, branchName, payee, flags, isSelected, onToggle, onOpen }: ExpenseRowProps) {
  const isVoid = expense.status === 'void'
  const isNotExpense = category?.group === 'not_expense'
  const time = rowTime(expense)
  const categoryName = category?.name ?? 'Unknown category'
  const amountText = isVoid ? formatPeso(expense.amountCents) : formatMoneyOut(expense.amountCents)
  const spoken = `${categoryName}, ${pesoWords(expense.amountCents)}${isVoid ? ', voided' : ''}`

  return (
    <tr
      onClick={onOpen}
      data-state={isSelected ? 'selected' : undefined}
      className={cn(
        'group cursor-pointer transition-colors hover:bg-wn-sand/70',
        isSelected && 'bg-wn-coral-wash/60 hover:bg-wn-coral-wash',
      )}
    >
      <td className={cn(TD, 'w-11 pl-4')} onClick={(event) => event.stopPropagation()}>
        {isVoid ? null : (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggle}
            aria-label={`Select ${spoken}`}
            className="size-[18px] border-wn-stone/60"
          />
        )}
      </td>
      <td className={cn(TD, 'whitespace-nowrap text-[13px] tabular-nums text-wn-stone')} title={time.title}>
        {time.text}
      </td>
      <td className={TD}>
        <div className="flex items-center gap-2.5">
          <CategoryBadge category={category} />
          <div className="min-w-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onOpen()
              }}
              aria-label={`Open ${spoken}`}
              className={cn(
                'block max-w-56 truncate rounded text-left font-semibold text-wn-ink outline-none focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2',
                isVoid && 'text-wn-stone line-through',
              )}
            >
              {categoryName}
            </button>
            {isNotExpense && !isVoid && (
              <div className="mt-0.5">
                <NotExpenseChip />
              </div>
            )}
          </div>
        </div>
      </td>
      <td className={cn(TD, 'max-w-72')}>
        <p className={cn('truncate text-wn-ink', isVoid && 'text-wn-stone line-through')}>
          {expense.note?.trim() || payee || <span className="text-wn-stone">—</span>}
        </p>
        {expense.note?.trim() && payee && <p className="truncate text-[12.5px] text-wn-stone">{payee}</p>}
        {isVoid && <VoidChip reason={expense.voidReason} />}
        {flags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {flags.map((flag) => (
              <FlagChip key={flag} flag={flag} />
            ))}
          </div>
        )}
      </td>
      <td className={cn(TD, 'whitespace-nowrap text-[13.5px]')}>
        <PaidFromLabel paidFrom={expense.paidFrom} />
        {branchName && <p className="mt-0.5 text-[12px] text-wn-stone">{branchName}</p>}
      </td>
      <td className={cn(TD, 'max-w-32 truncate text-[13.5px] text-wn-ink')}>{expense.createdByName}</td>
      <td className={cn(TD, 'text-center')}>
        {expense.receiptCount > 0 ? (
          <span className="inline-flex items-center text-wn-ink" title={`${expense.receiptCount} receipt${expense.receiptCount === 1 ? '' : 's'}`}>
            <Paperclip className="size-4" aria-hidden />
            <span className="sr-only">
              {expense.receiptCount} receipt{expense.receiptCount === 1 ? '' : 's'}
            </span>
          </span>
        ) : (
          <span className="text-wn-stone/70">
            <span aria-hidden>—</span>
            <span className="sr-only">No receipt</span>
          </span>
        )}
      </td>
      <td
        className={cn(
          TD,
          'whitespace-nowrap pr-5 text-right font-semibold tabular-nums text-wn-ink',
          isVoid && 'font-medium text-wn-stone line-through',
          isNotExpense && !isVoid && 'font-medium text-wn-stone',
        )}
      >
        <span aria-label={`${pesoWords(expense.amountCents)}${isVoid ? ', voided' : ''}`}>{amountText}</span>
      </td>
    </tr>
  )
}
