/**
 * What the Export page shows, worked out from the catalogue (plan §6): the
 * cards a caller can tick, which sheets a report's Export button starts
 * with, and how a preview cell reads. Pure, so the page and its tests agree.
 */

import {
  EXPORT_SHEETS,
  MAX_DETAIL_DAYS,
  SHEET_GROUPS,
  SHEET_GROUP_LABELS,
  SHEET_IDS,
  SHEET_REFUSAL_NOTES,
  sheetRefusal,
  visibleColumns,
  type SheetGroup,
  type SheetId,
} from './catalogue'
import type { ExportAccess, ExportCell, ExportCellKind } from './types'

export interface ExportCard {
  id: SheetId
  name: string
  rowIs: string
  /** The headers this caller would get, in order. */
  columns: string[]
  /** Row-by-row sheets take a shorter range. */
  isDetail: boolean
  /** Why it cannot be ticked, or null. */
  lockedNote: string | null
}

export interface ExportCardGroup {
  id: SheetGroup
  label: string
  cards: ExportCard[]
}

/** Every sheet, grouped. A sheet that would be one row (branches on a single-branch store) is not offered at all. */
export function exportCardGroups(access: ExportAccess, isMultiBranch: boolean): ExportCardGroup[] {
  const audience = { has: access.has, isMultiBranch }
  return SHEET_GROUPS.map((group) => ({
    id: group,
    label: SHEET_GROUP_LABELS[group],
    cards: SHEET_IDS.map((id) => EXPORT_SHEETS[id])
      .filter((sheet) => sheet.group === group)
      .flatMap((sheet): ExportCard[] => {
        const refusal = sheetRefusal(sheet, audience)
        if (refusal === 'single_branch') return []
        return [
          {
            id: sheet.id,
            name: sheet.name,
            rowIs: sheet.rowIs,
            columns: visibleColumns(sheet, access).map((column) => column.header),
            isDetail: sheet.source === 'detail',
            lockedNote: refusal ? `Not on your account: ${SHEET_REFUSAL_NOTES[refusal]}.` : null,
          },
        ]
      }),
  })).filter((group) => group.cards.length > 0)
}

/** The sheets the Export page starts with when nothing was asked for. */
export const DEFAULT_EXPORT_SHEETS: readonly SheetId[] = ['summary', 'sales_by_day', 'items', 'orders']

/** The sheets an Export button on a report page starts with: that report's own figures. */
export const REPORT_EXPORT_SHEETS = {
  overview: ['summary', 'sales_by_day'],
  items: ['items'],
  categories: ['categories'],
  payments: ['payments_by_method', 'payments_received'],
  channels: ['channels', 'order_types'],
  hours: ['summary', 'orders'],
  branches: ['branches'],
} as const satisfies Record<string, readonly SheetId[]>
export type ReportExportSource = keyof typeof REPORT_EXPORT_SHEETS

const KNOWN = new Set<string>(SHEET_IDS)

/** `?sheets=orders,items` → known ids, in catalogue order, no repeats. */
export function parseSheetsParam(value: string | string[] | undefined): SheetId[] {
  const text = Array.isArray(value) ? value.join(',') : (value ?? '')
  const asked = new Set(text.split(',').map((part) => part.trim()).filter((part) => KNOWN.has(part)))
  return SHEET_IDS.filter((id) => asked.has(id))
}

/** The starting ticks: what the link asked for, else the defaults; never a sheet the caller cannot have. */
export function initialSheets(asked: readonly SheetId[], groups: readonly ExportCardGroup[]): SheetId[] {
  const open = new Set(groups.flatMap((group) => group.cards.filter((card) => !card.lockedNote).map((card) => card.id)))
  const wanted = asked.length > 0 ? asked : DEFAULT_EXPORT_SHEETS
  return wanted.filter((id) => open.has(id))
}

export function dayCountInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
}

/** The sentence under the date row when the range is too long for a ticked row-by-row sheet. */
export function rangeProblem(days: number, picked: readonly ExportCard[]): string | null {
  const detail = picked.find((card) => card.isDetail)
  if (!detail || days <= MAX_DETAIL_DAYS) return null
  return `${detail.name} lists every row, so one file covers up to ${MAX_DETAIL_DAYS} days. You picked ${days}. Shorten the dates, or untick the row-by-row sheets.`
}

const PESO = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const COUNT = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })
const NUMBER = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })

function formatNumber(value: number, kind: ExportCellKind): string {
  if (kind === 'money') return `₱${PESO.format(value)}`
  if (kind === 'count') return COUNT.format(value)
  if (kind === 'percent') return `${NUMBER.format(value * 100)}%`
  return NUMBER.format(value)
}

/** A preview cell as the page prints it. Blank stays blank: it is not zero. */
export function formatPreviewCell(cell: ExportCell, kind: ExportCellKind): string {
  if (cell === null || cell === '') return ''
  if (typeof cell === 'string') return cell
  if (typeof cell === 'number') return formatNumber(cell, kind === 'text' ? 'number' : kind)
  return cell.value === null ? '' : formatNumber(cell.value, cell.kind)
}
