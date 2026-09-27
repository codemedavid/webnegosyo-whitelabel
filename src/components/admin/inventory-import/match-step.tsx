'use client'

import { ArrowRight, Check, CircleSlash, TriangleAlert } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  assignColumn,
  missingRequiredFields,
  type ColumnMapping,
} from '@/lib/inventory/import/column-matching'
import { IMPORT_FIELDS, type ImportFieldKey } from '@/lib/inventory/import/fields'
import type { ImportSheet } from '@/lib/inventory/import/sheet'

const SKIP = '__skip__'
const SAMPLE_COUNT = 3

interface MatchStepProps {
  sheet: ImportSheet
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
}

function samplesFor(sheet: ImportSheet, columnIndex: number): string[] {
  const values: string[] = []
  for (const row of sheet.rows) {
    const value = row.cells[columnIndex]
    if (value) values.push(value)
    if (values.length === SAMPLE_COUNT) break
  }
  return values
}

export function MatchStep({ sheet, mapping, onChange }: MatchStepProps) {
  const titled = sheet.headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => header.trim() !== '' || samplesFor(sheet, index).length > 0)
  const matchedCount = titled.filter(({ index }) => mapping[index]).length
  const missing = missingRequiredFields(mapping)

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        We matched <span className="font-medium text-foreground tabular-nums">{matchedCount} of {titled.length}</span>{' '}
        for you. Anything set to “Don’t import” is left out.
      </p>

      {missing.length > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Pick the column that holds each ingredient’s <strong className="font-semibold">Name</strong> — every row
          needs one.
        </p>
      )}

      <ul className="divide-y rounded-2xl border">
        {titled.map(({ header, index }) => {
          const field = mapping[index]
          const samples = samplesFor(sheet, index)
          return (
            <li key={index} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,15rem)] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium">{header || `Column ${index + 1}`}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {samples.length > 0 ? samples.join(' · ') : 'Empty column'}
                </p>
              </div>

              <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden />

              <div className="flex items-center gap-2">
                <Select
                  value={field ?? SKIP}
                  onValueChange={(value) =>
                    onChange(assignColumn(mapping, index, value === SKIP ? null : (value as ImportFieldKey)))
                  }
                >
                  <SelectTrigger
                    aria-label={`What “${header || `Column ${index + 1}`}” holds`}
                    className={cn('w-full max-sm:h-11', !field && 'text-muted-foreground')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKIP}>Don’t import</SelectItem>
                    {IMPORT_FIELDS.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
                        {option.isRequired ? ' (required)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    field
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                  aria-label={field ? 'Matched' : 'Skipped'}
                >
                  {field ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <CircleSlash className="h-3.5 w-3.5" />}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
