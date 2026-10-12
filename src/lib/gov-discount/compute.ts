/**
 * `computeGovDiscount` — the one entry point that turns a sale and its
 * claimants into what comes off the bill.
 *
 * Pure and deterministic: the register calls it on every keystroke for the
 * live preview, the server calls it again to verify what the register charged,
 * and both must agree to the centavo.
 */

import { allocateCents, toCents, toPesos } from './money'
import { allocateShares } from './allocation'
import { normalizeClaimantName, normalizeIdNumber } from './claimant-id'
import { priceShare, serviceChargeRelief } from './pricing'
import { GOV_DISCOUNT_RULES } from './rules'
import { govDiscountWarnings, validateGovDiscount } from './validation'
import type { GovClaimantResult, GovDiscountInput, GovDiscountResult } from './types'

function distribute(
  totalCents: number,
  byLine: Readonly<Record<string, number>>,
): Record<string, number> {
  const keys = Object.keys(byLine)
  const parts = allocateCents(totalCents, keys.map((key) => byLine[key]))
  return Object.fromEntries(
    keys.flatMap((key, index) => (parts[index] > 0 ? [[key, toPesos(parts[index])]] : [])),
  )
}

export function computeGovDiscount(input: GovDiscountInput): GovDiscountResult {
  const problems = validateGovDiscount(input)
  if (problems.length > 0) return { ok: false, problems }

  const diners = input.diners ?? 0
  const shares = allocateShares(input.lines, input.claimants, diners)
  const itemsCents = input.lines.reduce((sum, line) => sum + toCents(line.amount), 0)
  const serviceCents =
    input.vatStatus === 'vat' && input.serviceChargeMode === 'exempt_share'
      ? toCents(input.serviceCharge ?? 0)
      : 0

  const lineTotals: Record<string, number> = {}
  const claimants: GovClaimantResult[] = input.claimants.map((claimant) => {
    const share = shares.get(claimant.id) ?? { byLine: {}, gross: 0 }
    const figures = priceShare(share.gross, claimant.kind, input.vatStatus)
    const service =
      GOV_DISCOUNT_RULES[claimant.kind].vatTreatment === 'exempt'
        ? serviceChargeRelief(serviceCents, share.gross, itemsCents)
        : { share: 0, vatRemoved: 0 }

    const foodReduction = share.gross - figures.netDue
    const lineReductions = distribute(foodReduction, share.byLine)
    for (const [key, amount] of Object.entries(lineReductions)) {
      lineTotals[key] = toPesos(toCents(lineTotals[key] ?? 0) + toCents(amount))
    }

    return {
      id: claimant.id,
      kind: claimant.kind,
      name: normalizeClaimantName(claimant.name),
      idNumber: normalizeIdNumber(claimant.idNumber),
      allocation: claimant.allocation,
      grossShare: toPesos(share.gross),
      vatExemptSales: toPesos(figures.vatExemptSales + (service.share - service.vatRemoved)),
      vatRemoved: toPesos(figures.vatRemoved),
      discount: toPesos(figures.discount),
      netDue: toPesos(figures.netDue),
      serviceChargeShare: toPesos(service.share),
      serviceChargeVatRemoved: toPesos(service.vatRemoved),
      reduction: toPesos(foodReduction + service.vatRemoved),
      lineReductions,
    }
  })

  const totalReductionCents = claimants.reduce(
    (sum, claimant) => sum + toCents(claimant.reduction),
    0,
  )

  return {
    ok: true,
    claimants,
    totalReduction: toPesos(totalReductionCents),
    lineReductions: lineTotals,
    warnings: govDiscountWarnings(input),
  }
}
