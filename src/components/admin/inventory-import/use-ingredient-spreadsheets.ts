'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { buildIngredientExport, exportFileName } from '@/lib/inventory/import/export-table'
import { TEMPLATE_HEADERS } from '@/lib/inventory/import/fields'
import { buildCsvText, buildIngredientsWorkbook } from '@/lib/inventory/import/workbook'
import { CSV_TYPE, XLSX_TYPE, downloadFile } from '@/components/admin/inventory-import/download-file'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

export type SpreadsheetFormat = 'xlsx' | 'csv'

interface UseIngredientSpreadsheetsOptions {
  ingredients: readonly InventoryItem[]
  units: readonly InventoryUnitRow[]
  storeName: string
}

export interface IngredientSpreadsheets {
  /** Which download is being built, so its control can show it is working. */
  pending: SpreadsheetFormat | 'template' | null
  exportIngredients: (ids: readonly string[], format: SpreadsheetFormat) => Promise<void>
  downloadTemplate: (format: SpreadsheetFormat) => Promise<void>
}

const plural = (count: number) => `${count} ${count === 1 ? 'ingredient' : 'ingredients'}`

/**
 * Export and template downloads. Both write the SAME columns, so an export is
 * a filled-in template and imports straight back with nothing to match.
 */
export function useIngredientSpreadsheets({
  ingredients,
  units,
  storeName,
}: UseIngredientSpreadsheetsOptions): IngredientSpreadsheets {
  const [pending, setPending] = useState<IngredientSpreadsheets['pending']>(null)

  const save = useCallback(
    async (rows: readonly InventoryItem[], format: SpreadsheetFormat, kind: 'ingredients' | 'template') => {
      const table =
        kind === 'template' ? { headers: TEMPLATE_HEADERS, rows: [] } : buildIngredientExport(rows, units)
      const fileName = exportFileName(kind, format, storeName, new Date())

      if (format === 'csv') {
        downloadFile(buildCsvText(table), fileName, CSV_TYPE)
        return
      }
      const buffer = await buildIngredientsWorkbook({ table, units })
      downloadFile(buffer, fileName, XLSX_TYPE)
    },
    [units, storeName],
  )

  const exportIngredients = useCallback(
    async (ids: readonly string[], format: SpreadsheetFormat) => {
      const wanted = new Set(ids)
      const rows = ingredients.filter((item) => wanted.has(item.id))
      if (rows.length === 0) {
        toast.info('There’s nothing to export yet.')
        return
      }
      setPending(format)
      try {
        await save(rows, format, 'ingredients')
        toast.success(`Exported ${plural(rows.length)}`)
      } catch (error) {
        console.error('[inventory-export] failed', error)
        toast.error('We couldn’t build that file. Try again, or pick CSV instead.')
      } finally {
        setPending(null)
      }
    },
    [ingredients, save],
  )

  const downloadTemplate = useCallback(
    async (format: SpreadsheetFormat) => {
      setPending('template')
      try {
        await save([], format, 'template')
      } catch (error) {
        console.error('[inventory-template] failed', error)
        toast.error('We couldn’t build the template. Try again in a moment.')
      } finally {
        setPending(null)
      }
    },
    [save],
  )

  return { pending, exportIngredients, downloadTemplate }
}
