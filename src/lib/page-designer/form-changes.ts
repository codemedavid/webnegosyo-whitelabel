/**
 * The Page Designer's checkout form editor, as data: the questions every
 * order type asks (`customer_form_fields`), the editor's draft of them, and
 * the writes that turn the saved questions into the draft.
 *
 * Pure: the browser uses it to know whether anything changed, the server
 * (form-save.ts) recomputes the writes itself from what it reads, so the
 * browser never chooses which rows are written. Every write is checked with
 * the order-type service's own schema.
 */

import { z } from 'zod'

import { CHECKOUT_FIELD_TYPES, renderableFieldType, TYPES_WITH_CHOICES, type CheckoutFieldType } from '@/lib/checkout-field-types'
import { customerFormFieldSchema, FORM_FIELD_LIMITS, type CustomerFormFieldInput } from '@/lib/order-types/customer-form-field-schema'

/** One question as the editor holds it. `id` is the row id, or a temp id until it is created. */
export interface FormQuestion {
  id: string
  field_name: string
  field_label: string
  field_type: CheckoutFieldType
  is_required: boolean
  placeholder: string
  options: string[]
  validation_rules: Record<string, unknown>
}

/** Order type id → its questions, in the order the checkout asks them. */
export type FormDraft = Readonly<Record<string, readonly FormQuestion[]>>

/** An order type as the form editor shows it (its tab). */
export interface FormOrderType {
  id: string
  name: string
  type: string
  description: string | null
  isEnabled: boolean
  advanceOrderEnabled: boolean
  /** False = register only (a Grab counter): the storefront's checkout never offers it. */
  isOnWeb: boolean
}

/** What the page loads for the form editor: the store's order types and their saved questions. */
export interface CheckoutFormSource {
  orderTypes: FormOrderType[]
  saved: FormDraft
}

export type FormOp =
  | { op: 'create'; orderTypeId: string; tempId: string; field: CustomerFormFieldInput }
  | { op: 'update'; orderTypeId: string; fieldId: string; field: CustomerFormFieldInput }
  | { op: 'delete'; orderTypeId: string; fieldId: string }
  /** The final order; ids of new questions are their temp ids until created. */
  | { op: 'reorder'; orderTypeId: string; fieldIds: string[] }

export interface FormDiff {
  ops: FormOp[]
  /** Why the draft can't be saved as it is (empty = it can). */
  problems: string[]
}

/** Most questions one order type may ask. */
export const MAX_QUESTIONS = 40
/** Most order types one save may touch. */
export const MAX_ORDER_TYPES = 20

const TEMP_PREFIX = 'new-'

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX)
}

export function makeTempId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${TEMP_PREFIX}${random}`
}

interface StoredFieldRow {
  id: string
  field_name: string | null
  field_label: string | null
  field_type: string | null
  is_required: boolean | null
  placeholder?: string | null
  options?: unknown
  validation_rules?: unknown
  order_index?: number | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** A stored row as an editor question (nulls and odd jsonb read as empty). */
export function questionFromRow(row: StoredFieldRow): FormQuestion {
  return {
    id: row.id,
    field_name: row.field_name ?? '',
    field_label: row.field_label ?? '',
    field_type: renderableFieldType(row.field_type),
    is_required: row.is_required === true,
    placeholder: row.placeholder ?? '',
    options: Array.isArray(row.options) ? row.options.filter((o): o is string => typeof o === 'string') : [],
    validation_rules: isRecord(row.validation_rules) ? row.validation_rules : {},
  }
}

/** Every order type's questions, by order type, sorted as the checkout asks them. */
export function formDraftFromRows(orderTypeIds: readonly string[], rows: readonly (StoredFieldRow & { order_type_id: string })[]): FormDraft {
  // Ties (old rows sharing an index) break on the id, so two reads of the same rows always agree.
  const sorted = [...rows].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return Object.fromEntries(
    orderTypeIds.map((id) => [id, sorted.filter((row) => row.order_type_id === id).map(questionFromRow)]),
  )
}

/** Stable JSON (object keys sorted) so equal content compares equal whatever the key order. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
  return JSON.stringify(value ?? null)
}

export function sameQuestion(a: FormQuestion, b: FormQuestion): boolean {
  return stable(a) === stable(b)
}

export function sameQuestions(a: readonly FormQuestion[] = [], b: readonly FormQuestion[] = []): boolean {
  return a.length === b.length && a.every((q, i) => sameQuestion(q, b[i]))
}

/** The order types whose questions differ between `saved` and `draft`. */
export function changedOrderTypes(saved: FormDraft, draft: FormDraft): string[] {
  return Object.keys(draft).filter((id) => !sameQuestions(saved[id], draft[id]))
}

/** "Car plate" → "car_plate", unique among `taken`. */
export function nameForQuestion(label: string, taken: ReadonlySet<string>): string {
  const base = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'question'
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}_${n}`)) n += 1
  return `${base}_${n}`
}

function toInput(question: FormQuestion, index: number): CustomerFormFieldInput {
  return {
    field_name: question.field_name,
    field_label: question.field_label,
    field_type: question.field_type,
    is_required: question.is_required,
    placeholder: question.placeholder,
    validation_rules: question.validation_rules,
    // Choices only mean something to the types that pick from them.
    options: TYPES_WITH_CHOICES.includes(question.field_type) ? question.options.map((o) => o.trim()).filter(Boolean) : [],
    order_index: index,
  }
}

const sameContent = (a: FormQuestion, b: FormQuestion) => sameQuestion({ ...a, id: '' }, { ...b, id: '' })

interface DiffOptions {
  /** Order type names for the problem messages ("Delivery · question 2 …"). */
  names?: Readonly<Record<string, string>>
}

function diffOrderType(orderTypeId: string, saved: readonly FormQuestion[], draft: readonly FormQuestion[], where: string, diff: { creates: FormOp[]; updates: FormOp[]; deletes: FormOp[]; reorders: FormOp[]; problems: string[] }) {
  if (draft.length > MAX_QUESTIONS) diff.problems.push(`${where}: at most ${MAX_QUESTIONS} questions`)
  const savedById = new Map(saved.map((q) => [q.id, q]))
  const taken = new Set([...saved.map((q) => q.field_name), ...draft.map((q) => q.field_name.trim()).filter(Boolean)])
  const seenNames = new Set<string>()
  const seenIds = new Set<string>()
  const finalIds: string[] = []

  draft.forEach((question, index) => {
    if (seenIds.has(question.id)) diff.problems.push(`${where}: a question is listed twice`)
    seenIds.add(question.id)
    const before = savedById.get(question.id)
    // A saved question keeps its stored name: old orders keep their answers under it.
    const fieldName = before ? before.field_name : question.field_name.trim() || nameForQuestion(question.field_label, new Set([...taken, ...seenNames]))
    if (seenNames.has(fieldName)) diff.problems.push(`${where}: two questions store their answer as "${fieldName}"`)
    seenNames.add(fieldName)
    const named = { ...question, field_name: fieldName }
    const input = toInput(named, index)
    const parsed = customerFormFieldSchema.safeParse(input)
    const label = `${where} · question ${index + 1}${question.field_label.trim() ? ` (${question.field_label.trim()})` : ''}`
    if (!parsed.success) diff.problems.push(`${label}: ${parsed.error.issues[0]?.message ?? 'can’t be saved'}`)
    else if (TYPES_WITH_CHOICES.includes(question.field_type) && !parsed.data.options?.length) diff.problems.push(`${label}: add at least one choice`)
    finalIds.push(question.id)
    if (!parsed.success) return
    if (!before) diff.creates.push({ op: 'create', orderTypeId, tempId: question.id, field: parsed.data })
    else if (!sameContent(before, named)) diff.updates.push({ op: 'update', orderTypeId, fieldId: question.id, field: parsed.data })
  })

  for (const question of saved) if (!seenIds.has(question.id)) diff.deletes.push({ op: 'delete', orderTypeId, fieldId: question.id })
  const savedOrder = saved.map((q) => q.id).filter((id) => seenIds.has(id))
  const keptOrder = finalIds.filter((id) => savedById.has(id))
  const hasNew = finalIds.length !== keptOrder.length
  if (hasNew || savedOrder.join() !== keptOrder.join() || finalIds.length !== saved.length) {
    diff.reorders.push({ op: 'reorder', orderTypeId, fieldIds: finalIds })
  }
}

/**
 * The writes that turn `saved` into `draft`, in the order they must run:
 * every create, every update, every delete, then one reorder per order type
 * that needs it (it can name new questions by their temp ids). Order types
 * missing from `draft` are left alone.
 */
export function diffFormFields(saved: FormDraft, draft: FormDraft, { names = {} }: DiffOptions = {}): FormDiff {
  const diff = { creates: [] as FormOp[], updates: [] as FormOp[], deletes: [] as FormOp[], reorders: [] as FormOp[], problems: [] as string[] }
  const ids = changedOrderTypes(saved, draft)
  if (ids.length > MAX_ORDER_TYPES) diff.problems.push(`At most ${MAX_ORDER_TYPES} order types at once`)
  for (const id of ids) diffOrderType(id, saved[id] ?? [], draft[id] ?? [], names[id] ?? 'Order type', diff)
  return { ops: [...diff.creates, ...diff.updates, ...diff.deletes, ...diff.reorders], problems: diff.problems }
}

/** `draft` with every created question's temp id replaced by its new row id. */
export function remapTempIds(draft: FormDraft, created: Readonly<Record<string, string>>): FormDraft {
  return Object.fromEntries(
    Object.entries(draft).map(([id, questions]) => [id, questions.map((q) => (created[q.id] ? { ...q, id: created[q.id] } : q))]),
  )
}

/**
 * `to`'s questions replaced by copies of `from`'s. A question `to` already
 * asks under the same stored name keeps its row (so old answers stay with
 * it); the rest are new.
 */
export function copyQuestions(draft: FormDraft, from: string, to: string): FormDraft {
  const existing = new Map((draft[to] ?? []).map((q) => [q.field_name, q.id]))
  const copies = (draft[from] ?? []).map((q) => {
    const keptId = q.field_name ? existing.get(q.field_name) : undefined
    return { ...q, id: keptId ?? makeTempId(), options: [...q.options], validation_rules: { ...q.validation_rules } }
  })
  return { ...draft, [to]: copies }
}

// ── What the browser sends ──────────────────────────────────────────────────

export const formQuestionSchema = z
  .object({
    id: z.string().min(1).max(80),
    field_name: z.string().max(FORM_FIELD_LIMITS.name),
    field_label: z.string().max(FORM_FIELD_LIMITS.label),
    field_type: z.enum(CHECKOUT_FIELD_TYPES),
    is_required: z.boolean(),
    placeholder: z.string().max(FORM_FIELD_LIMITS.placeholder),
    options: z.array(z.string().max(FORM_FIELD_LIMITS.optionLength)).max(FORM_FIELD_LIMITS.options),
    validation_rules: z.record(z.string(), z.unknown()),
  })
  .strict()

/**
 * Per changed order type: the questions the editor loaded (`base`, for the
 * "changed elsewhere" check) and the draft to save.
 */
export const formSaveInputSchema = z
  .object({
    orderTypes: z.record(
      z.string().uuid(),
      z.object({ base: z.array(formQuestionSchema).max(MAX_QUESTIONS * 2), draft: z.array(formQuestionSchema).max(MAX_QUESTIONS) }).strict(),
    ),
  })
  .strict()
  .refine((input) => Object.keys(input.orderTypes).length <= MAX_ORDER_TYPES, 'Too many order types at once')

export type FormSaveInput = z.infer<typeof formSaveInputSchema>

/** What a save hands back: the stored questions of each saved order type, and temp id → new row id. */
export interface FormSaveOutcome {
  fields: Record<string, FormQuestion[]>
  created: Record<string, string>
  /**
   * A write failed part-way: `fields` is what the database holds now and
   * `created` the questions that did get a row. The editor takes both as
   * saved and keeps the rest of its draft, so a retry finishes the job
   * instead of creating the same question twice.
   */
  isPartial?: true
}

/** The save input for `draft` against `saved` (undefined = nothing changed). */
export function formSaveInput(saved: FormDraft, draft: FormDraft): FormSaveInput | undefined {
  const ids = changedOrderTypes(saved, draft)
  if (!ids.length) return undefined
  return {
    orderTypes: Object.fromEntries(ids.map((id) => [id, { base: [...(saved[id] ?? [])], draft: [...(draft[id] ?? [])] }])),
  }
}
