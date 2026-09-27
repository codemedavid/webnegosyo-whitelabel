'use client'

import { useCallback, useMemo, useState } from 'react'
import { importIngredientsBatchAction } from '@/app/actions/inventory-import'
import {
  isEveryColumnMatched,
  matchColumns,
  missingRequiredFields,
  type ColumnMapping,
} from '@/lib/inventory/import/column-matching'
import { toCsv } from '@/lib/inventory/import/csv'
import { IMPORT_BATCH_SIZE } from '@/lib/inventory/import/import-batch'
import type { ImportRowResult } from '@/lib/inventory/import/import-apply'
import {
  buildImportPlan,
  toImportBatches,
  type ImportPlan,
  type ImportRowPayload,
} from '@/lib/inventory/import/import-plan'
import { MAX_IMPORT_ROWS, toImportSheet, type ImportSheet } from '@/lib/inventory/import/sheet'
import { readSpreadsheetFile } from '@/lib/inventory/import/workbook'
import { resolveDefaultMovementOutlet, type SelectableBranch } from '@/lib/inventory/stock-outlet'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

export type ImportStep = 'upload' | 'match' | 'review' | 'importing' | 'done'

export interface RowProblem {
  rowNumber: number
  name: string
  message: string
}

export interface ImportOutcome {
  created: number
  updated: number
  /** Rows the server did not save. */
  failed: RowProblem[]
  /** Rows saved whose stock count did not record. */
  stockProblems: RowProblem[]
  /** Rows the review screen held back. */
  skipped: number
}

interface UseIngredientImportOptions {
  tenantId: string
  ingredients: readonly InventoryItem[]
  units: readonly InventoryUnitRow[]
  branches: readonly SelectableBranch[]
  onImported: (items: InventoryItem[]) => void
}

const NO_ROWS_MESSAGE =
  'We couldn’t find any ingredients in this file. Check that the first row has column names and your ingredients are underneath.'

function countResults(results: readonly ImportRowResult[], nameOf: (row: number) => string) {
  const problem = (result: ImportRowResult, message: string): RowProblem => ({
    rowNumber: result.rowNumber,
    name: nameOf(result.rowNumber),
    message,
  })
  return {
    created: results.filter((r) => r.outcome === 'created').length,
    updated: results.filter((r) => r.outcome === 'updated').length,
    failed: results.filter((r) => r.outcome === 'failed').map((r) => problem(r, r.error ?? 'Not saved')),
    stockProblems: results.filter((r) => r.stockError).map((r) => problem(r, r.stockError ?? '')),
    items: results.flatMap((r) => (r.item ? [r.item] : [])),
  }
}

export function useIngredientImport({
  tenantId,
  ingredients,
  units,
  branches,
  onImported,
}: UseIngredientImportOptions) {
  // Same default as the stock dialog: a one-branch store's shelf IS that
  // branch, and counting into the store pool would split its stock in two.
  const defaultOutletId = resolveDefaultMovementOutlet(branches)
  const [step, setStep] = useState<ImportStep>('upload')
  const [fileName, setFileName] = useState('')
  const [sheet, setSheet] = useState<ImportSheet | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>([])
  const [wasAutoMatched, setWasAutoMatched] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [unitOverrides, setUnitOverrides] = useState<Record<string, string>>({})
  const [updateExistingStock, setUpdateExistingStock] = useState(false)
  const [outletId, setOutletId] = useState<string | null>(defaultOutletId)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  // The plan as it stood when the import ran. The live one re-plans against
  // the ingredients the import just saved, which would re-read the rows it
  // held back against a list that no longer matches what the merchant reviewed.
  const [importedPlan, setImportedPlan] = useState<ImportPlan | null>(null)

  const activeUnits = useMemo(() => units.filter((unit) => unit.is_active !== false), [units])

  const plan: ImportPlan | null = useMemo(
    () =>
      sheet
        ? buildImportPlan(sheet, mapping, ingredients, activeUnits, { updateExistingStock, unitOverrides })
        : null,
    [sheet, mapping, ingredients, activeUnits, updateExistingStock, unitOverrides],
  )

  const reset = useCallback(() => {
    setStep('upload')
    setFileName('')
    setSheet(null)
    setMapping([])
    setWasAutoMatched(false)
    setReadError(null)
    setUnitOverrides({})
    setUpdateExistingStock(false)
    setOutletId(defaultOutletId)
    setProgress({ done: 0, total: 0 })
    setOutcome(null)
    setImportedPlan(null)
  }, [defaultOutletId])

  const openFile = useCallback(async (file: File) => {
    setIsReading(true)
    setReadError(null)
    try {
      const read = await readSpreadsheetFile(file)
      if (!read.ok) {
        setReadError(read.message)
        return
      }

      const next = toImportSheet(read.grid)
      if (next.rows.length === 0) {
        setReadError(NO_ROWS_MESSAGE)
        return
      }
      if (next.rows.length > MAX_IMPORT_ROWS) {
        setReadError(
          `This file has ${next.rows.length.toLocaleString()} rows. Import up to ${MAX_IMPORT_ROWS.toLocaleString()} at a time — split it into smaller files.`,
        )
        return
      }

      const nextMapping = matchColumns(next.headers)
      const isReady =
        isEveryColumnMatched(next.headers, nextMapping) && missingRequiredFields(nextMapping).length === 0
      setFileName(file.name)
      setSheet(next)
      setMapping(nextMapping)
      setUnitOverrides({})
      setWasAutoMatched(isReady)
      // A file in our own columns has nothing to match — straight to the review.
      setStep(isReady ? 'review' : 'match')
    } finally {
      setIsReading(false)
    }
  }, [])

  const pickUnit = useCallback((key: string, unitId: string) => {
    setUnitOverrides((current) => ({ ...current, [key]: unitId }))
  }, [])

  const nameOfRow = useCallback(
    (rowNumber: number) => plan?.rows.find((row) => row.rowNumber === rowNumber)?.name ?? `Row ${rowNumber}`,
    [plan],
  )

  const runImport = useCallback(async () => {
    if (!plan) return
    const batches = toImportBatches(plan, IMPORT_BATCH_SIZE)
    const total = batches.reduce((sum, batch) => sum + batch.length, 0)
    if (total === 0) return

    setImportedPlan(plan)
    setStep('importing')
    setProgress({ done: 0, total })
    const results: ImportRowResult[] = []

    for (let index = 0; index < batches.length; index++) {
      const batch = batches[index]
      const response = await importIngredientsBatchAction(tenantId, { outletId, rows: batch }).catch(() => ({
        success: false as const,
        error: 'We lost the connection. Check your internet and import the remaining rows again.',
      }))

      if (!response.success) {
        // Every later batch would fail the same way (signed out, offline), so
        // the rest are reported as not imported rather than retried blindly.
        const unsent: ImportRowPayload[] = batches.slice(index).flat()
        results.push(...unsent.map((row) => ({ rowNumber: row.rowNumber, outcome: 'failed' as const, error: response.error })))
        break
      }
      results.push(...response.data)
      setProgress({ done: results.length, total })
    }

    const counted = countResults(results, nameOfRow)
    setOutcome({
      created: counted.created,
      updated: counted.updated,
      failed: counted.failed,
      stockProblems: counted.stockProblems,
      skipped: plan.summary.error,
    })
    setStep('done')
    if (counted.items.length > 0) onImported(counted.items)
  }, [plan, tenantId, outletId, nameOfRow, onImported])

  /** The rows to fix, as a CSV in the file's own columns plus a "Problem" column. */
  const buildRowsToFix = useCallback((): string | null => {
    const reviewed = importedPlan ?? plan
    if (!sheet || !reviewed) return null
    const problems = new Map<number, string>()
    for (const row of reviewed.rows) {
      if (row.status === 'error') problems.set(row.rowNumber, row.issues.map((issue) => issue.message).join(' '))
    }
    for (const failure of outcome?.failed ?? []) problems.set(failure.rowNumber, failure.message)
    if (problems.size === 0) return null

    const rows = sheet.rows
      .filter((row) => problems.has(row.rowNumber))
      .map((row) => [...row.cells, problems.get(row.rowNumber) ?? ''])
    return `﻿${toCsv([[...sheet.headers, 'Problem'], ...rows])}`
  }, [sheet, plan, importedPlan, outcome])

  return {
    step,
    setStep,
    fileName,
    sheet,
    mapping,
    setMapping,
    wasAutoMatched,
    isReading,
    readError,
    plan,
    units: activeUnits,
    unitOverrides,
    pickUnit,
    updateExistingStock,
    setUpdateExistingStock,
    outletId,
    setOutletId,
    progress,
    outcome,
    openFile,
    runImport,
    reset,
    buildRowsToFix,
  }
}

export type IngredientImport = ReturnType<typeof useIngredientImport>
