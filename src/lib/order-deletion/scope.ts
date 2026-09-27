/**
 * What an owner may ask to delete: a date range, a hand-picked set, or
 * everything. The scope is the only steerable input on the deletion path, so
 * it is parsed strictly and an unrecognised shape is refused, never widened.
 */
import { z } from 'zod'
import { MANILA_OFFSET_HOURS, MAX_SELECTED_ORDERS } from './constants'
import type { DeletionRequest, DeletionScope } from './types'

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A YYYY-MM-DD string that names a real calendar day. */
function isCalendarDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const daySchema = z.string().refine(isCalendarDay, 'Use a real date (YYYY-MM-DD).')

const scopeSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('range'), from: daySchema, to: daySchema })
    .strict()
    .refine((range) => range.from <= range.to, 'The end date must be on or after the start date.'),
  z.object({ kind: z.literal('all') }).strict(),
  z
    .object({
      kind: z.literal('selected'),
      orderIds: z.array(z.string().uuid()).min(1, 'Select at least one order.').max(MAX_SELECTED_ORDERS),
    })
    .strict(),
])

const requestSchema = z.object({
  scope: scopeSchema,
  includeActive: z.boolean().optional(),
})

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseDeletionRequest(input: unknown): ParseResult<DeletionRequest> {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid deletion request.' }
  }

  const { scope, includeActive } = parsed.data
  const normalized: DeletionScope =
    scope.kind === 'selected' ? { kind: 'selected', orderIds: [...new Set(scope.orderIds)] } : scope

  return { ok: true, value: { scope: normalized, includeActive: includeActive === true } }
}

/** Whole Manila days from `from` through `to`, as an end-exclusive UTC window. */
export function rangeBounds(from: string, to: string): { startIso: string; endIso: string } {
  const offsetMs = MANILA_OFFSET_HOURS * 60 * 60 * 1000
  const start = new Date(`${from}T00:00:00.000Z`).getTime() - offsetMs
  const end = new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 - offsetMs
  return { startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() }
}

export function describeScope(scope: DeletionScope): string {
  switch (scope.kind) {
    case 'all':
      return 'All orders'
    case 'range':
      return scope.from === scope.to
        ? `Orders on ${scope.from}`
        : `Orders from ${scope.from} to ${scope.to}`
    case 'selected': {
      const count = scope.orderIds.length
      return `${count} selected order${count === 1 ? '' : 's'}`
    }
  }
}
