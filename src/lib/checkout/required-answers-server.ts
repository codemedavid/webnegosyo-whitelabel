/**
 * The store's required checkout questions, read on the server, and the
 * verdict on an order's answers.
 *
 * Used by `createOrderAction` (authoritative) and by the checkout's preflight
 * (`preflightCheckoutAnswersAction`, which only moves the refusal ahead of the
 * optimistic "Order placed!" screen). The questions always come from the
 * database for the order's tenant + order type, never from the request.
 *
 * A read that fails or times out lets the order through: the checkout form
 * already asked these questions, and a database blip must never cost a sale.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import {
  describeFieldErrors,
  findMissingRequiredAnswers,
  type FieldValidationError,
  type RequiredQuestion,
} from '@/lib/checkout/required-answers'

type AdminClient = ReturnType<typeof createAdminClient>

/** Budget for the questions read on the order path (a timed admin client). */
export const REQUIRED_QUESTIONS_TIMEOUT_MS = 4_000

/** Far above any real form (the biggest store asks a dozen); a bound, not a rule. */
export const REQUIRED_QUESTIONS_READ_LIMIT = 200

export type RequiredQuestionsRead = { ok: true; questions: RequiredQuestion[] } | { ok: false }

const NO_QUESTIONS: RequiredQuestionsRead = { ok: true, questions: [] }

function toQuestion(row: unknown): RequiredQuestion | null {
  if (!row || typeof row !== 'object') return null
  const { field_name, field_label, field_type, is_required } = row as Record<string, unknown>
  if (typeof field_name !== 'string' || field_name === '' || is_required !== true) return null
  return {
    field_name,
    field_label: typeof field_label === 'string' && field_label.trim() !== '' ? field_label : field_name,
    field_type: typeof field_type === 'string' ? field_type : 'text',
    is_required: true,
  }
}

/**
 * The REQUIRED questions of one order type of one store, in form order. Never
 * throws: a failure (error, timeout, an unreadable answer) is `{ ok: false }`.
 * No order type means no questions (the checkout never submits without one;
 * the customer app may).
 */
export async function readRequiredQuestions(
  client: AdminClient,
  tenantId: string,
  orderTypeId: string | undefined | null,
): Promise<RequiredQuestionsRead> {
  if (!orderTypeId) return NO_QUESTIONS
  try {
    const { data, error } = await client
      .from('customer_form_fields')
      .select('field_name, field_label, field_type, is_required, order_index')
      .eq('tenant_id', tenantId)
      .eq('order_type_id', orderTypeId)
      .eq('is_required', true)
      .order('order_index', { ascending: true })
      .limit(REQUIRED_QUESTIONS_READ_LIMIT)
    if (error || !Array.isArray(data)) {
      console.warn('[required-answers] Questions read failed; the order is not checked', {
        tenantId,
        orderTypeId,
        error: error?.message ?? 'unreadable answer',
      })
      return { ok: false }
    }
    return {
      ok: true,
      questions: (data as unknown[]).map(toQuestion).filter((question): question is RequiredQuestion => question !== null),
    }
  } catch (error) {
    console.warn('[required-answers] Questions read threw; the order is not checked', {
      tenantId,
      orderTypeId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false }
  }
}

export type RequiredAnswersVerdict =
  | { ok: true }
  | { ok: false; message: string; fieldErrors: FieldValidationError[] }

/** The verdict on received answers. An unreadable question list has no opinion. */
export function judgeRequiredAnswers(
  read: RequiredQuestionsRead,
  answers: Readonly<Record<string, unknown>> | null | undefined,
): RequiredAnswersVerdict {
  if (!read.ok) return { ok: true }
  const fieldErrors = findMissingRequiredAnswers(read.questions, answers)
  return fieldErrors.length === 0 ? { ok: true } : { ok: false, message: describeFieldErrors(fieldErrors), fieldErrors }
}
