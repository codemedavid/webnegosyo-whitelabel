'use client'

import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DATE_RANGE_LABELS,
  DATE_RANGES,
  PAYMENT_FILTER_LABELS,
  PAYMENT_FILTERS,
  type DateRange,
  type PaymentFilter,
} from '@/lib/admin/orders-table/filters'
import { OUTLET_FILTER_UNASSIGNED } from '@/lib/outlets/order-outlet-display'

const ANY = '__any__'

export interface ToolbarOption {
  value: string
  label: string
}

interface OrdersToolbarProps {
  search: string
  onSearch: (value: string) => void
  /** Omit to hide the date menu (a backend that can't read a past window). */
  range?: DateRange
  onRange?: (range: DateRange) => void
  type: string | null
  typeOptions: readonly ToolbarOption[]
  onType: (type: string | null) => void
  branch: string | null
  /** Empty hides the menu: a single-location store or a branch account. */
  branchOptions: readonly ToolbarOption[]
  onBranch: (branch: string | null) => void
  payment?: PaymentFilter
  onPayment?: (payment: PaymentFilter) => void
  /** Shown when anything but the tab and date narrows the list. */
  onClear?: () => void
}

const TRIGGER = 'h-10 w-full rounded-xl bg-white text-[14px] sm:w-auto sm:min-w-[150px]'

export function OrdersToolbar(props: OrdersToolbarProps) {
  const { search, onSearch, range, onRange, type, typeOptions, onType, branch, branchOptions, onBranch, payment, onPayment, onClear } = props
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-[260px]">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-wn-stone" />
        <Input
          type="search"
          aria-label="Search by order number, name or phone"
          placeholder="Order #, name or phone"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="h-10 rounded-xl bg-white pl-9 text-[14px]"
        />
      </div>

      {range && onRange && (
        <Select value={range} onValueChange={(value) => onRange(value as DateRange)}>
          <SelectTrigger aria-label="Date" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((value) => (
              <SelectItem key={value} value={value}>
                {DATE_RANGE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {typeOptions.length > 0 && (
        <Select value={type ?? ANY} onValueChange={(value) => onType(value === ANY ? null : value)}>
          <SelectTrigger aria-label="Order type" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Every order type</SelectItem>
            {typeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {branchOptions.length > 0 && (
        <Select value={branch ?? ANY} onValueChange={(value) => onBranch(value === ANY ? null : value)}>
          <SelectTrigger aria-label="Branch" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Every branch</SelectItem>
            {branchOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
            <SelectItem value={OUTLET_FILTER_UNASSIGNED}>No branch</SelectItem>
          </SelectContent>
        </Select>
      )}

      {payment && onPayment && (
        <Select value={payment} onValueChange={(value) => onPayment(value as PaymentFilter)}>
          <SelectTrigger aria-label="Payment" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {PAYMENT_FILTER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-10 items-center gap-1 self-start rounded-xl px-3 text-[13.5px] font-semibold text-wn-stone outline-none hover:bg-wn-sand hover:text-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink sm:self-auto"
        >
          <X aria-hidden className="size-4" />
          Clear filters
        </button>
      )}
    </div>
  )
}
