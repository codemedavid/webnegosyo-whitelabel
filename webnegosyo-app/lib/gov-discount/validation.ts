/**
 * Everything that must be true before a government discount is priced.
 *
 * Problems are refusals (the discount cannot be applied as entered); warnings
 * are notices the cashier should see but that never block the sale. Every
 * message is written for the person at the counter.
 */

import { unclaimedUnits } from './allocation'
import {
  checkIdNumber,
  isClaimantNameValid,
  looksLikeUnusualPwdId,
  normalizeIdNumber,
} from './claimant-id'
import { GOV_DISCOUNT_KINDS, GOV_DISCOUNT_RULES } from './rules'
import type { GovClaimantInput, GovDiscountInput, GovProblem } from './types'

const MAX_DINERS = 100

function claimantProblems(
  claimant: GovClaimantInput,
  input: GovDiscountInput,
  enabled: ReadonlySet<string>,
): GovProblem[] {
  const rule = GOV_DISCOUNT_RULES[claimant.kind]
  const at = { claimantId: claimant.id }
  const problems: GovProblem[] = []

  if (!enabled.has(claimant.kind)) {
    problems.push({ ...at, code: 'kind_disabled', message: `${rule.label} discounts are switched off for this store.` })
  }
  if (!isClaimantNameValid(claimant.name)) {
    problems.push({ ...at, code: 'name_missing', message: 'Enter the name on their ID.' })
  }
  const idVerdict = checkIdNumber(claimant.idNumber)
  if (idVerdict === 'missing') {
    problems.push({ ...at, code: 'id_missing', message: `Enter their ${rule.idLabel}.` })
  } else if (idVerdict === 'invalid') {
    problems.push({ ...at, code: 'id_invalid', message: 'That ID number does not look right — use letters, numbers and dashes only.' })
  }

  if (claimant.allocation.mode === 'shared') {
    if (input.allowShared === false) {
      problems.push({ ...at, code: 'shared_not_allowed', message: 'For take-out and delivery, pick their own items instead of splitting the table.' })
    }
    return problems
  }

  const { units } = claimant.allocation
  const lineByKey = new Map(input.lines.map((line) => [line.key, line]))
  let assigned = 0
  for (const [key, raw] of Object.entries(units)) {
    if (raw === 0) continue
    const line = lineByKey.get(key)
    if (!line || !Number.isInteger(raw) || raw < 0) {
      problems.push({ ...at, code: 'units_invalid', message: 'One of the picked items is no longer on the order.' })
      continue
    }
    if (!line.eligible) {
      problems.push({ ...at, code: 'ineligible_line', message: `${line.name} is not covered by the discount at this store.` })
      continue
    }
    if (raw > unclaimedUnits(line, input.claimants, claimant.id)) {
      problems.push({ ...at, code: 'units_exceed', message: `There are not that many ${line.name} left to assign.` })
      continue
    }
    assigned += raw
  }
  if (assigned === 0) {
    problems.push({ ...at, code: 'nothing_assigned', message: 'Pick at least one item they ordered.' })
  }
  return problems
}

function tableProblems(input: GovDiscountInput): GovProblem[] {
  const problems: GovProblem[] = []
  const shared = input.claimants.filter((claimant) => claimant.allocation.mode === 'shared')

  if (shared.length > 0) {
    const diners = input.diners
    if (diners === undefined || !Number.isInteger(diners) || diners < 1 || diners > MAX_DINERS) {
      problems.push({ code: 'diners_missing', message: 'Enter how many people are sharing the table.' })
    } else if (diners < shared.length) {
      problems.push({ code: 'diners_too_few', message: `${shared.length} people are claiming, so the table needs at least ${shared.length} diners.` })
    }
  }

  const seen = new Map<string, string>()
  for (const claimant of input.claimants) {
    const id = normalizeIdNumber(claimant.idNumber)
    if (id === '') continue
    if (seen.has(id)) {
      problems.push({
        claimantId: claimant.id,
        code: 'id_duplicate',
        message: 'This ID is already on the order. One person gets one 20% discount, even if they are both Senior and PWD.',
      })
    }
    seen.set(id, claimant.id)
  }

  if (input.claimants.length > 0 && !input.lines.some((line) => line.eligible && line.amount > 0)) {
    problems.push({ code: 'nothing_eligible', message: 'Nothing on this order is covered by the discount.' })
  }
  return problems
}

export function validateGovDiscount(input: GovDiscountInput): GovProblem[] {
  const enabled = new Set<string>(input.enabledKinds ?? GOV_DISCOUNT_KINDS)
  return [
    ...input.claimants.flatMap((claimant) => claimantProblems(claimant, input, enabled)),
    ...tableProblems(input),
  ]
}

export function govDiscountWarnings(input: GovDiscountInput): GovProblem[] {
  return input.claimants
    .filter((claimant) => looksLikeUnusualPwdId(claimant.kind, claimant.idNumber))
    .map((claimant) => ({
      claimantId: claimant.id,
      code: 'id_invalid' as const,
      message: 'This is not the usual PWD ID format (RR-PPMM-BBB-NNNNNNN). Check the card before continuing.',
    }))
}
