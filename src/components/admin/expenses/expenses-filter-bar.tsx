'use client'

import { useId } from 'react'
import { Search, X } from 'lucide-react'
import { GROUP_LABELS, sortCategories } from '@/lib/expenses/categories'
import { EXPENSE_GROUPS, PAID_FROM, type ExpenseCategory, type PaidFrom } from '@/lib/expenses/types'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAID_FROM_LABELS } from './expense-format'
import { ANY, WHOLE_STORE, hasActiveFilters, NO_FILTERS, type ExpenseFilters } from './expense-list-model'

interface ExpensesFilterBarProps {
  filters: ExpenseFilters
  onChange: (filters: ExpenseFilters) => void
  categories: readonly ExpenseCategory[]
  outlets: readonly { id: string; name: string }[]
  showBranch: boolean
}

const TRIGGER = 'min-h-11 rounded-full border-wn-line bg-white px-4 text-[13.5px] font-semibold text-wn-ink data-[size=default]:h-11'

export function ExpensesFilterBar({ filters, onChange, categories, outlets, showBranch }: ExpensesFilterBarProps) {
  const ids = { category: useId(), paidFrom: useId(), branch: useId(), search: useId() }
  const ordered = sortCategories(categories)
  const categoryName = categories.find((category) => category.id === filters.categoryId)?.name
  const branchName =
    filters.branch === WHOLE_STORE ? 'Whole store' : (outlets.find((outlet) => outlet.id === filters.branch)?.name ?? 'All branches')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={ids.category} className="sr-only">
        Category
      </span>
      <Select value={filters.categoryId} onValueChange={(categoryId) => onChange({ ...filters, categoryId })}>
        <SelectTrigger aria-labelledby={ids.category} className={TRIGGER}>
          <SelectValue>{filters.categoryId === ANY ? 'All categories' : (categoryName ?? 'Category')}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ANY}>All categories</SelectItem>
          {EXPENSE_GROUPS.map((group) => {
            const inGroup = ordered.filter((category) => category.group === group)
            if (inGroup.length === 0) return null
            return (
              <SelectGroup key={group}>
                <SelectLabel>{GROUP_LABELS[group]}</SelectLabel>
                {inGroup.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                    {category.archivedAt ? ' (archived)' : ''}
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          })}
        </SelectContent>
      </Select>

      <span id={ids.paidFrom} className="sr-only">
        Paid from
      </span>
      <Select value={filters.paidFrom} onValueChange={(paidFrom) => onChange({ ...filters, paidFrom: paidFrom as PaidFrom | typeof ANY })}>
        <SelectTrigger aria-labelledby={ids.paidFrom} className={TRIGGER}>
          <SelectValue>{filters.paidFrom === ANY ? 'Paid from: any' : PAID_FROM_LABELS[filters.paidFrom]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Paid from: any</SelectItem>
          {PAID_FROM.map((paidFrom) => (
            <SelectItem key={paidFrom} value={paidFrom}>
              {PAID_FROM_LABELS[paidFrom]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showBranch && (
        <>
          <span id={ids.branch} className="sr-only">
            Branch
          </span>
          <Select value={filters.branch} onValueChange={(branch) => onChange({ ...filters, branch })}>
            <SelectTrigger aria-labelledby={ids.branch} className={TRIGGER}>
              <SelectValue>{filters.branch === ANY ? 'All branches' : branchName}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All branches</SelectItem>
              <SelectItem value={WHOLE_STORE}>Whole store</SelectItem>
              {outlets.map((outlet) => (
                <SelectItem key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      <div className="relative min-w-52 flex-1 sm:max-w-72">
        <label htmlFor={ids.search} className="sr-only">
          Search notes, who was paid, or an amount
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-wn-stone" aria-hidden />
        <input
          id={ids.search}
          type="search"
          value={filters.search}
          placeholder="Search note, paid to, ₱ amount"
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          className="h-11 w-full rounded-full border border-wn-line bg-white pl-10 pr-4 text-[14px] text-wn-ink outline-none placeholder:text-wn-stone/80 focus-visible:border-wn-ink focus-visible:ring-[3px] focus-visible:ring-wn-ink/15"
        />
      </div>

      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={() => onChange(NO_FILTERS)}
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[13.5px] font-bold text-wn-ink outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-wn-ink"
        >
          <X className="size-4" aria-hidden />
          Clear filters
        </button>
      )}
    </div>
  )
}
