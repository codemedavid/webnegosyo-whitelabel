'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'
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

/** Long enough for the browser to start reading the blob before its URL is freed. */
const REVOKE_DELAY_MS = 60_000
/** Our refusals are short sentences; anything longer is not one of them. */
const MAX_REFUSAL_LENGTH = 300
const EXPORT_FAILED = 'Couldn’t download the export. Try again.'

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking at once can cancel the download in some browsers (Safari, Firefox).
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

function fileNameFrom(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="([^"]+)"/)
  return match ? match[1] : fallback
}

async function refusalText(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim()
    return text !== '' && text.length <= MAX_REFUSAL_LENGTH ? text : EXPORT_FAILED
  } catch {
    return EXPORT_FAILED
  }
}

/**
 * Fetches the export and saves it. A refusal (no access, too many rows, a
 * paused subscription) is shown as a toast, never saved as a file that holds
 * the refusal's sentence.
 */
export async function downloadExport(href: string, fallbackName: string): Promise<void> {
  try {
    const response = await fetch(href, { cache: 'no-store' })
    if (!response.ok) {
      toast.error(await refusalText(response))
      return
    }
    saveBlob(await response.blob(), fileNameFrom(response.headers.get('Content-Disposition'), fallbackName))
  } catch {
    toast.error('Couldn’t download the export. Check your connection and try again.')
  }
}

interface ExportMenuProps {
  range: ExportRange
  monthLabel: string
}

/** The accountant export for the month: one row per expense, voids included (plan §2.6). */
export function ExportMenu({ range, monthLabel }: ExportMenuProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  function download(format: 'csv' | 'xlsx'): void {
    if (isDownloading) return
    setIsDownloading(true)
    void downloadExport(exportHref(range, format), `expenses-${range.from}.${format}`).finally(() => setIsDownloading(false))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-busy={isDownloading || undefined}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-bold text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
        >
          <Download className="size-4" aria-hidden />
          {isDownloading ? 'Exporting…' : 'Export'}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[12px] font-semibold text-wn-stone">
          {monthLabel}, for your accountant
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => download('xlsx')} className="flex min-h-10 items-center gap-2.5">
          <FileSpreadsheet className="size-4 text-wn-stone" aria-hidden />
          Excel (.xlsx) with a summary
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download('csv')} className="flex min-h-10 items-center gap-2.5">
          <FileText className="size-4 text-wn-stone" aria-hidden />
          CSV
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
  saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName)
}
