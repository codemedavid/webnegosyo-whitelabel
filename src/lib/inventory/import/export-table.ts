/**
 * Ingredients → the rows of an export file.
 *
 * Written in the template's own columns, with plain numbers and Yes/No, so the
 * export IS a filled-in template: edit it anywhere and import it straight back.
 * The older table export wrote "4.5 kg" into one cell, which reads well and
 * imports as nothing.
 */

import { TEMPLATE_HEADERS } from '@/lib/inventory/import/fields'
import type { ImportUnit } from '@/lib/inventory/import/unit-matching'
import type { InventoryItem } from '@/types/database'

export type ExportCell = string | number

export interface ExportTable {
  headers: string[]
  rows: ExportCell[][]
}

/** Trims the float noise a NUMERIC(16,4) round-trip leaves behind. */
function cleanNumber(value: number): number {
  return Number(Number(value ?? 0).toFixed(4))
}

const yesNo = (value: boolean) => (value ? 'Yes' : 'No')

export function buildIngredientExport(
  ingredients: readonly InventoryItem[],
  units: readonly ImportUnit[],
): ExportTable {
  const abbreviationById = new Map(units.map((unit) => [unit.id, unit.abbreviation]))

  return {
    headers: TEMPLATE_HEADERS,
    rows: ingredients.map((item) => [
      item.name,
      item.sku?.trim() ?? '',
      item.category?.trim() ?? '',
      abbreviationById.get(item.stock_unit_id) ?? '',
      cleanNumber(item.unit_cost),
      cleanNumber(item.reorder_level),
      cleanNumber(item.current_qty),
      yesNo(item.is_prep),
      yesNo(item.is_active),
    ]),
  }
}

function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The merchant's calendar day, not UTC's — a 7am Manila export is not "yesterday". */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `juans-cafe-ingredients-2026-09-24.xlsx`, or `ingredients-template.csv`. */
export function exportFileName(
  kind: 'ingredients' | 'template',
  extension: 'xlsx' | 'csv',
  storeName: string,
  date: Date,
): string {
  const parts =
    kind === 'template'
      ? [slugify(storeName), 'ingredients-template']
      : [slugify(storeName), 'ingredients', localDay(date)]
  return `${parts.filter(Boolean).join('-')}.${extension}`
}
