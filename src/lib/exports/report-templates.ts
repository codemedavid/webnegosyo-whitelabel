/**
 * Saved report formats ("My formats", plan §6.2, §6.3): a custom report, or
 * the owner's own layout, kept under a name to run again for any dates. A
 * format holds a SHAPE (`TemplateShape`), never a figure: running one goes through the export
 * engine as the person who runs it, so their staff keys and their branch
 * decide what comes back, whoever saved it.
 *
 * Pure and browser-safe. The table is `report_templates`; every row is
 * checked again here on the way out (a stored spec is whatever was true when
 * it was saved: the catalogue may have moved on).
 */

import { z } from 'zod'
import { EXPORT_SHEETS, MAX_DETAIL_DAYS, SHEET_REFUSAL_NOTES, sheetRefusal, visibleColumns, type SheetId } from './catalogue'
import { customColumnProblem, customReportSpecSchema, plainWords, type CustomReportSpec } from './custom-report'
import { formatColumnProblems, formatSheets, formatSummary, reportFormatSpecSchema, type ReportFormatSpec } from './report-format'
import type { ExportAccess } from './types'

/** Mirrors the limit trigger in `20261114150000_report_templates.sql`. */
export const MAX_REPORT_TEMPLATES = 50
export const MAX_TEMPLATE_NAME = 60

export const templateNameSchema = plainWords(MAX_TEMPLATE_NAME)

/**
 * What a client may ask `POST /api/exports/formats` for. Strict: an unknown
 * field is refused. `save` keeps a custom report (one sheet reshaped),
 * `save_format` keeps the owner's own layout (their tabs and columns, §6.3).
 */
export const templateActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), tenantId: z.uuid(), name: templateNameSchema, spec: customReportSpecSchema }).strict(),
  z.object({ action: z.literal('save_format'), tenantId: z.uuid(), name: templateNameSchema, spec: reportFormatSpecSchema }).strict(),
  z.object({ action: z.literal('remove'), tenantId: z.uuid(), id: z.uuid() }).strict(),
])
export type TemplateAction = z.infer<typeof templateActionSchema>

/** What a saved format holds: a custom report's spec, or the owner's own layout. */
export type TemplateShape = { kind: 'custom'; spec: CustomReportSpec } | { kind: 'format'; spec: ReportFormatSpec }

export type ReportTemplate = TemplateShape & {
  id: string
  name: string
  /** Who saved it, as the store typed their name. */
  savedBy: string | null
  savedAt: string
}

const rowBase = { id: z.uuid(), name: templateNameSchema, created_by_label: z.string().nullish(), created_at: z.string() }
const rowSchema = z.discriminatedUnion('kind', [
  z.object({ ...rowBase, kind: z.literal('custom'), spec: customReportSpecSchema }),
  z.object({ ...rowBase, kind: z.literal('format'), spec: reportFormatSpecSchema }),
])

/** A stored row as a format, or null when it no longer reads as one (unknown kind, a sheet or spec this build does not know). */
export function toReportTemplate(row: unknown): ReportTemplate | null {
  const parsed = rowSchema.safeParse(row)
  if (!parsed.success) return null
  const { id, name, created_by_label, created_at } = parsed.data
  const shape: TemplateShape = parsed.data.kind === 'custom' ? { kind: 'custom', spec: parsed.data.spec } : { kind: 'format', spec: parsed.data.spec }
  return { ...shape, id, name, savedBy: created_by_label?.trim() || null, savedAt: created_at }
}

/** The catalogue sheets a saved format reads. */
export function templateSheets(shape: TemplateShape): SheetId[] {
  return shape.kind === 'custom' ? [shape.spec.sheet] : formatSheets(shape.spec)
}

function quoted(ids: readonly string[]): string {
  return ids.map((id) => `"${id}"`).join(', ')
}

/** Why a shape cannot be saved at all: it names a column its sheet does not have for ANY account. */
export function templateSpecProblem(shape: TemplateShape): string | null {
  if (shape.kind === 'custom') {
    const sheet = EXPORT_SHEETS[shape.spec.sheet]
    const problem = customColumnProblem(shape.spec, sheet.columns)
    return problem ? `${sheet.name} has no column called ${quoted(problem.unknown)}.` : null
  }
  const [problem] = formatColumnProblems(shape.spec, (sheet) => EXPORT_SHEETS[sheet].columns)
  return problem ? `${EXPORT_SHEETS[problem.sheet].name} has no column called ${quoted(problem.unknown)} (the “${problem.tab}” tab).` : null
}

/** "Sales by day · Day, Avg ticket, Orders · highest Avg ticket first · first 5" */
function customSummary(spec: CustomReportSpec): string {
  const sheet = EXPORT_SHEETS[spec.sheet]
  const header = (id: string): string => spec.columns.find((column) => column.id === id)?.header ?? sheet.columns.find((column) => column.id === id)?.header ?? id
  const parts = [sheet.name, spec.columns.map((column) => header(column.id)).join(', ')]
  if (spec.filters.length > 0) parts.push(`${spec.filters.length} ${spec.filters.length === 1 ? 'filter' : 'filters'}`)
  if (spec.sort) parts.push(`${spec.sort.descending ? 'highest' : 'lowest'} ${header(spec.sort.column)} first`)
  if (spec.top !== null) parts.push(`first ${spec.top}`)
  return parts.join(' · ')
}

/** One line saying what a saved format is made of. */
export function templateSummary(shape: TemplateShape): string {
  return shape.kind === 'custom' ? customSummary(shape.spec) : `Your format · ${formatSummary(shape.spec)}`
}

export interface TemplateCard {
  id: string
  name: string
  kind: TemplateShape['kind']
  summary: string
  savedBy: string | null
  /** The catalogue sheets it reads; the link names the format by id, the server reads its shape. */
  sheets: SheetId[]
  /** Row-by-row sheets take a shorter range. */
  isDetail: boolean
  /** Why THIS account cannot run it, or null. */
  lockedNote: string | null
}

const COLUMN_LOCK = 'Not on your account: it uses a column your account does not have access to.'

/** Why this account cannot run the format at all, or null. A format whose OTHER tabs are open still runs, with the closed tab left out and named. */
function lockedNote(shape: TemplateShape, access: ExportAccess, isMultiBranch: boolean): string | null {
  const audience = { has: access.has, isMultiBranch }
  const sheets = templateSheets(shape)
  const refusals = sheets.map((id) => sheetRefusal(EXPORT_SHEETS[id], audience))
  const firstRefusal = refusals.find((refusal) => refusal !== null)
  if (firstRefusal && refusals.every((refusal) => refusal !== null)) return `Not on your account: ${SHEET_REFUSAL_NOTES[firstRefusal]}.`
  if (shape.kind === 'custom') return customColumnProblem(shape.spec, visibleColumns(EXPORT_SHEETS[shape.spec.sheet], access)) ? COLUMN_LOCK : null
  const open = new Set(sheets.filter((_, index) => refusals[index] === null))
  const problems = formatColumnProblems(shape.spec, (sheet) => visibleColumns(EXPORT_SHEETS[sheet], access))
  return problems.some((problem) => open.has(problem.sheet)) ? COLUMN_LOCK : null
}

/** A format as the Export page (and the app) lists it for one account. */
export function templateCard(template: ReportTemplate, access: ExportAccess, isMultiBranch: boolean): TemplateCard {
  const sheets = templateSheets(template)
  return {
    id: template.id,
    name: template.name,
    kind: template.kind,
    summary: templateSummary(template),
    savedBy: template.savedBy,
    sheets,
    isDetail: sheets.some((id) => EXPORT_SHEETS[id].source !== 'summary'),
    lockedNote: lockedNote(template, access, isMultiBranch),
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
