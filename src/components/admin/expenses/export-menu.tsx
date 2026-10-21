'use client'

import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { buildExportRows, exportRowsToCsv, type ExportOutlet } from '@/lib/expenses/export'
import type { Expense, ExpenseCategory, Supplier } from '@/lib/expenses/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ANY, WHOLE_STORE } from './expense-list-model'

export interface ExportRange {
  tenantId: string
  from: string
  to: string
  /** The branch filter: an outlet id, WHOLE_STORE or ANY. */
  branch: string
}

/** `/api/expenses/export` for the month on screen (and its branch filter, when one is set). */
export function exportHref(range: ExportRange, format: 'csv' | 'xlsx'): string {
  const params = new URLSearchParams({ tenantId: range.tenantId, from: range.from, to: range.to, format })
  if (range.branch === WHOLE_STORE) params.set('outletId', 'store')
  else if (range.branch !== ANY) params.set('outletId', range.branch)
  return `/api/expenses/export?${params.toString()}`
}

interface ExportMenuProps {
  range: ExportRange
  monthLabel: string
}

/** The accountant export for the month: one row per expense, voids included (plan §2.6). */
export function ExportMenu({ range, monthLabel }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-bold text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
        >
          <Download className="size-4" aria-hidden />
          Export
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[12px] font-semibold text-wn-stone">
          {monthLabel}, for your accountant
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={exportHref(range, 'xlsx')} download className="flex min-h-10 items-center gap-2.5">
            <FileSpreadsheet className="size-4 text-wn-stone" aria-hidden />
            Excel (.xlsx) with a summary
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={exportHref(range, 'csv')} download className="flex min-h-10 items-center gap-2.5">
            <FileText className="size-4 text-wn-stone" aria-hidden />
            CSV
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface SelectionExport {
  expenses: readonly Expense[]
  categories: readonly ExpenseCategory[]
  suppliers: readonly Supplier[]
  outlets: readonly ExportOutlet[]
  fileName: string
}

/**
 * "Export selected": the same accountant columns, built in the browser from
 * the rows already on screen (the server export reads whole periods).
 */
export function downloadSelectionCsv({ expenses, categories, suppliers, outlets, fileName }: SelectionExport): void {
  const csv = exportRowsToCsv(buildExportRows(expenses, categories, suppliers, outlets))
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
