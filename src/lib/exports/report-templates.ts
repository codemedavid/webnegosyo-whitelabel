/**
 * Saved report formats ("My formats", plan §6.2): a custom report the store
 * kept under a name, to run again for any dates. A format holds a SHAPE (the
 * custom report spec), never a figure: running one goes through the export
 * engine as the person who runs it, so their staff keys and their branch
 * decide what comes back, whoever saved it.
 *
 * Pure and browser-safe. The table is `report_templates`; every row is
 * checked again here on the way out (a stored spec is whatever was true when
 * it was saved: the catalogue may have moved on).
 */

import { z } from 'zod'
import { EXPORT_SHEETS, MAX_DETAIL_DAYS, SHEET_REFUSAL_NOTES, sheetRefusal, visibleColumns } from './catalogue'
import { customColumnProblem, customReportSpecSchema, plainWords, type CustomReportSpec } from './custom-report'
import type { ExportAccess } from './types'

/** Mirrors the limit trigger in `20261114150000_report_templates.sql`. */
export const MAX_REPORT_TEMPLATES = 50
export const MAX_TEMPLATE_NAME = 60

export const templateNameSchema = plainWords(MAX_TEMPLATE_NAME)

/** What a client may ask `POST /api/exports/formats` for. Strict: an unknown field is refused. */
export const templateActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), tenantId: z.uuid(), name: templateNameSchema, spec: customReportSpecSchema }).strict(),
  z.object({ action: z.literal('remove'), tenantId: z.uuid(), id: z.uuid() }).strict(),
])
export type TemplateAction = z.infer<typeof templateActionSchema>

export interface ReportTemplate {
  id: string
  name: string
  spec: CustomReportSpec
  /** Who saved it, as the store typed their name. */
  savedBy: string | null
  savedAt: string
}

const rowSchema = z.object({
  id: z.uuid(),
  name: templateNameSchema,
  kind: z.literal('custom'),
  spec: customReportSpecSchema,
  created_by_label: z.string().nullish(),
  created_at: z.string(),
})

/** A stored row as a format, or null when it no longer reads as one (unknown kind, a sheet or spec this build does not know). */
export function toReportTemplate(row: unknown): ReportTemplate | null {
  const parsed = rowSchema.safeParse(row)
  if (!parsed.success) return null
  const { id, name, spec, created_by_label, created_at } = parsed.data
  return { id, name, spec, savedBy: created_by_label?.trim() || null, savedAt: created_at }
}

/** Why a spec cannot be saved at all: it names a column its sheet does not have for ANY account. */
export function templateSpecProblem(spec: CustomReportSpec): string | null {
  const sheet = EXPORT_SHEETS[spec.sheet]
  const problem = customColumnProblem(spec, sheet.columns)
  return problem ? `${sheet.name} has no column called ${problem.unknown.map((id) => `"${id}"`).join(', ')}.` : null
}

/** "Sales by day · Day, Avg ticket, Orders · highest Avg ticket first · first 5" */
export function templateSummary(spec: CustomReportSpec): string {
  const sheet = EXPORT_SHEETS[spec.sheet]
  const header = (id: string): string => spec.columns.find((column) => column.id === id)?.header ?? sheet.columns.find((column) => column.id === id)?.header ?? id
  const parts = [sheet.name, spec.columns.map((column) => header(column.id)).join(', ')]
  if (spec.filters.length > 0) parts.push(`${spec.filters.length} ${spec.filters.length === 1 ? 'filter' : 'filters'}`)
  if (spec.sort) parts.push(`${spec.sort.descending ? 'highest' : 'lowest'} ${header(spec.sort.column)} first`)
  if (spec.top !== null) parts.push(`first ${spec.top}`)
  return parts.join(' · ')
}

export interface TemplateCard {
  id: string
  name: string
  summary: string
  savedBy: string | null
  spec: CustomReportSpec
  /** Row-by-row sheets take a shorter range. */
  isDetail: boolean
  /** Why THIS account cannot run it, or null. */
  lockedNote: string | null
}

/** A format as the Export page (and the app) lists it for one account. */
export function templateCard(template: ReportTemplate, access: ExportAccess, isMultiBranch: boolean): TemplateCard {
  const sheet = EXPORT_SHEETS[template.spec.sheet]
  const refusal = sheetRefusal(sheet, { has: access.has, isMultiBranch })
  const missing = refusal ? null : customColumnProblem(template.spec, visibleColumns(sheet, access))
  return {
    id: template.id,
    name: template.name,
    summary: templateSummary(template.spec),
    savedBy: template.savedBy,
    spec: template.spec,
    isDetail: sheet.source !== 'summary',
    lockedNote: refusal
      ? `Not on your account: ${SHEET_REFUSAL_NOTES[refusal]}.`
      : missing
        ? 'Not on your account: it uses a column your account does not have access to.'
        : null,
  }
}

/** The sentence shown instead of the download when the dates are too long for a row-by-row format. */
export function templateRangeProblem(days: number, card: Pick<TemplateCard, 'isDetail' | 'name'>): string | null {
  if (!card.isDetail || days <= MAX_DETAIL_DAYS) return null
  return `${card.name} lists every row, so one file covers up to ${MAX_DETAIL_DAYS} days. You picked ${days}.`
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

const GENERIC_WORDS: ReadonlySet<string> = new Set(['my', 'the', 'our', 'saved', 'report', 'format', 'ko', 'yung', 'ang'])

/** The format someone named ("my weekly report" → "Weekly report"): the exact name, else the only one that contains the words. */
export function findTemplate<T extends { name: string }>(asked: string, templates: readonly T[]): T | null {
  // "my weekly report" → "weekly"; "my report" names nothing.
  const wanted = fold(asked)
    .split(' ')
    .filter((word) => !GENERIC_WORDS.has(word))
    .join(' ')
  if (!wanted) return null
  const exact = templates.find((template) => fold(template.name) === fold(asked)) ?? templates.find((template) => fold(template.name) === wanted)
  if (exact) return exact
  const words = wanted.split(' ')
  const close = templates.filter((template) => {
    const name = fold(template.name).split(' ')
    return words.every((word) => name.includes(word))
  })
  return close.length === 1 ? close[0] : null
}
