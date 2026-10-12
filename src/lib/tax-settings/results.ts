/**
 * What the Tax & discounts server actions answer, and the plain words for
 * every way a save can be refused.
 */

import type { TaxSettingsField } from './form-schema'

export type SaveTaxSettingsResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Partial<Record<TaxSettingsField, string>> }

export type SetApprovalPinResult = { success: true } | { success: false; error: string }

export const OWNER_ONLY_MESSAGE = 'Only the store owner can change tax and discount settings.'

const POSTGRES_RLS_REFUSAL = '42501'
const POSTGRES_CHECK_VIOLATION = '23514'

/** A refused write in plain words. RLS refusals on UPDATE are silent, so the caller checks rows too. */
export function describeTaxSaveError(code: string | undefined): string {
  if (code === POSTGRES_RLS_REFUSAL) return OWNER_ONLY_MESSAGE
  if (code === POSTGRES_CHECK_VIOLATION) {
    return 'One of the values was not accepted. Check your TIN, branch code and amounts, then try again.'
  }
  return 'Could not save your tax settings. Please try again.'
}

/** First message per field, from zod issues. */
export function fieldErrorsFromIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Partial<Record<TaxSettingsField, string>> {
  return issues.reduce<Partial<Record<TaxSettingsField, string>>>((errors, issue) => {
    const field = issue.path[0]
    if (typeof field !== 'string' || field in errors) return errors
    return { ...errors, [field]: issue.message }
  }, {})
}
