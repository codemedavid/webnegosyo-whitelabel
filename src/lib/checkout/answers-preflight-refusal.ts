/**
 * What the checkout does with the server's "required answer missing" preflight.
 *
 * The form checks the questions it shows, so the server only disagrees when
 * this tab's form is out of date: the owner made a question required, or
 * added one, after the page loaded. A question the tab shows gets its mistake
 * beside it (and `aria-invalid`) until the customer changes that answer; a
 * question the tab has never shown can only be answered after a refresh, so
 * the message says so. Pure, so the hook stays a thin caller.
 */

import { describeFieldErrors, type FieldValidationError } from '@/lib/checkout/required-answers'

export const STALE_FORM_MESSAGE =
  'The store just changed its checkout questions. Please refresh this page to answer them.'

/** A server-reported mistake, remembered with the answer it was about. */
export interface ServerAnswerMark {
  fieldName: string
  message: string
  answer: string
}

export interface AnswersPreflightRefusal {
  message: string
  marks: ServerAnswerMark[]
}

export function readAnswersPreflightRefusal(
  fieldErrors: readonly FieldValidationError[],
  shownFieldNames: readonly string[],
  answers: Readonly<Record<string, string>>,
): AnswersPreflightRefusal {
  const shown = new Set(shownFieldNames)
  const onForm = fieldErrors.filter((error) => shown.has(error.fieldName))
  const unseen = fieldErrors.filter((error) => !shown.has(error.fieldName))
  const parts = [onForm.length > 0 ? describeFieldErrors(onForm) : '', unseen.length > 0 ? STALE_FORM_MESSAGE : '']
  return {
    message: parts.filter(Boolean).join('\n'),
    marks: onForm.map((error) => ({
      fieldName: error.fieldName,
      message: error.message,
      answer: Object.prototype.hasOwnProperty.call(answers, error.fieldName) ? answers[error.fieldName] ?? '' : '',
    })),
  }
}

/**
 * The form's own mistakes plus the server's, each server mark shown only while
 * its answer is unchanged. The form's own sentence wins on the same question.
 */
export function withServerAnswerMarks(
  local: Readonly<Record<string, string>>,
  marks: readonly ServerAnswerMark[],
  answers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const live = marks.filter(
    (mark) => !(mark.fieldName in local) && (Object.prototype.hasOwnProperty.call(answers, mark.fieldName) ? answers[mark.fieldName] ?? '' : '') === mark.answer,
  )
  if (live.length === 0) return local
  return { ...Object.fromEntries(live.map((mark) => [mark.fieldName, mark.message])), ...local }
}
