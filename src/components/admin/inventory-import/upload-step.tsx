'use client'

import { useRef, useState, type DragEvent } from 'react'
import { AlertCircle, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MAX_IMPORT_ROWS } from '@/lib/inventory/import/sheet'
import type { SpreadsheetFormat } from '@/components/admin/inventory-import/use-ingredient-spreadsheets'

const ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.txt,.xls'

interface UploadStepProps {
  isReading: boolean
  error: string | null
  isTemplatePending: boolean
  onFile: (file: File) => void
  onDownloadTemplate: (format: SpreadsheetFormat) => void
}

const STEPS = [
  { title: 'Get the template', body: 'Or export what you have and edit that.' },
  { title: 'Fill in your ingredients', body: 'Only Name and Unit are needed.' },
  { title: 'Drop it here', body: 'You’ll check every change before it’s saved.' },
]

export function UploadStep({ isReading, error, isTemplatePending, onFile, onDownloadTemplate }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const takeFile = (file: File | undefined) => {
    if (file && !isReading) onFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    takeFile(event.dataTransfer.files[0])
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-[border-color,background-color,transform] duration-200 ease-out',
          isDragging
            ? 'scale-[1.01] border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
            : 'border-border bg-muted/40',
          error && !isDragging && 'border-rose-300 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20',
        )}
      >
        <span
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm transition-colors',
            isDragging ? 'bg-emerald-500 text-white' : 'bg-background text-emerald-600',
          )}
        >
          {isReading ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
        </span>

        <div className="space-y-1">
          <p className="text-lg font-semibold tracking-tight">
            {isReading ? 'Reading your file…' : isDragging ? 'Drop it!' : 'Drop your spreadsheet here'}
          </p>
          <p className="text-sm text-muted-foreground">
            Excel (.xlsx) or CSV · up to {MAX_IMPORT_ROWS.toLocaleString()} ingredients
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          className="h-11 rounded-full px-6"
          disabled={isReading}
          onClick={() => inputRef.current?.click()}
        >
          Choose a file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose a spreadsheet to import"
          onChange={(event) => {
            takeFile(event.target.files?.[0])
            // Cleared so choosing the same file again after fixing it still fires.
            event.target.value = ''
          }}
        />

        {error && (
          <p role="alert" className="flex max-w-md items-start gap-2 text-left text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold leading-tight">Starting from scratch?</p>
              <p className="text-sm text-muted-foreground">Our template has every column ready, with dropdowns.</p>
            </div>
          </div>
          <div className="flex gap-2 max-sm:w-full">
            <Button
              type="button"
              variant="outline"
              className="max-sm:h-11 max-sm:flex-1"
              disabled={isTemplatePending}
              onClick={() => onDownloadTemplate('xlsx')}
            >
              {isTemplatePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excel template
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="max-sm:h-11 max-sm:flex-1"
              disabled={isTemplatePending}
              onClick={() => onDownloadTemplate('csv')}
            >
              CSV
            </Button>
          </div>
        </div>

        <ol className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-3">
          {STEPS.map((item, index) => (
            <li key={item.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background tabular-nums">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium leading-6">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
