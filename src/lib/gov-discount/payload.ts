/**
 * How a government discount is stored on an order, and read back.
 *
 * It rides inside the order's discount payload (`customerData.discount` on
 * every backend, mirrored to `orders.discount_data` on the platform) as a
 * `government` block — no Convex schema bump, no tenant-database migration.
 * The ordinary `lines` carry the same money as plain labelled rows, so every
 * reader that predates this feature still prints a bill that adds up.
 *
 * The block keeps each claimant's ALLOCATION (not just the result), so an
 * edit can re-price the discount against the edited cart — remove the senior's
 * dish and their discount goes with it.
 */

import { shortClaimantName } from './claimant-id'
import { GOV_DISCOUNT_RULES, isGovDiscountKind } from './rules'
import type {
  GovAllocation,
  GovClaimantInput,
  GovClaimantResult,
  ServiceChargeMode,
  VatBreakdown,
  VatStatus,
} from './types'

export const GOV_PAYLOAD_VERSION = 1

export interface StoredGovDiscount {
  version: typeof GOV_PAYLOAD_VERSION
  vatStatus: VatStatus
  serviceChargeMode: ServiceChargeMode
  diners: number | null
  claimants: readonly GovClaimantResult[]
  vat: VatBreakdown | null
  /** Who approved it, when a manager had to. */
  approval?: { approvalId: string; approverName: string } | null
}

/** A plain discount line, the shape every order reader already understands. */
export interface GovDiscountLine {
  label: string
  amount: number
}

/**
 * The rows printed under the items, two per claimant at a VAT store:
 * "SC VAT exemption · J. Dela Cruz" and "SC 20% · J. Dela Cruz". The amounts
 * sum exactly to the claimant's reduction.
 */
export function govDiscountLines(claimants: readonly GovClaimantResult[]): GovDiscountLine[] {
  return claimants.flatMap((claimant) => {
    const rule = GOV_DISCOUNT_RULES[claimant.kind]
    const who = shortClaimantName(claimant.name)
    const vatPart = claimant.vatRemoved + claimant.serviceChargeVatRemoved
    if (rule.vatTreatment === 'exempt' && vatPart > 0) {
      return [
        { label: `${rule.code} VAT exemption · ${who}`, amount: roundPesos(vatPart) },
        { label: `${rule.code} ${rule.ratePercent}% · ${who}`, amount: claimant.discount },
      ]
    }
    return [{ label: `${rule.code} ${rule.ratePercent}% · ${who}`, amount: claimant.reduction }]
  })
}

function roundPesos(value: number): number {
  return Math.round(value * 100) / 100
}

/** The claimants as inputs again — what an edit re-prices with. */
export function claimantInputsFromStored(stored: StoredGovDiscount): GovClaimantInput[] {
  return stored.claimants.map((claimant) => ({
    id: claimant.id,
    kind: claimant.kind,
    name: claimant.name,
    idNumber: claimant.idNumber,
    allocation: claimant.allocation,
  }))
}

// --- reading an untyped blob ------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readAllocation(value: unknown): GovAllocation | null {
  if (!isRecord(value)) return null
  if (value.mode === 'shared') return { mode: 'shared' }
  if (value.mode !== 'items' || !isRecord(value.units)) return null
  const units: Record<string, number> = {}
  for (const [key, count] of Object.entries(value.units)) {
    if (typeof count === 'number' && Number.isInteger(count) && count > 0) units[key] = count
  }
  return { mode: 'items', units }
}

function readNumberMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  )
}

function readClaimant(value: unknown): GovClaimantResult | null {
  if (!isRecord(value) || !isGovDiscountKind(value.kind)) return null
  const allocation = readAllocation(value.allocation)
  if (!allocation || typeof value.id !== 'string') return null
  return {
    id: value.id,
    kind: value.kind,
    name: typeof value.name === 'string' ? value.name : '',
    idNumber: typeof value.idNumber === 'string' ? value.idNumber : '',
    allocation,
    grossShare: num(value.grossShare),
    vatExemptSales: num(value.vatExemptSales),
    vatRemoved: num(value.vatRemoved),
    discount: num(value.discount),
    netDue: num(value.netDue),
    serviceChargeShare: num(value.serviceChargeShare),
    serviceChargeVatRemoved: num(value.serviceChargeVatRemoved),
    reduction: num(value.reduction),
    lineReductions: readNumberMap(value.lineReductions),
  }
}

function readVat(value: unknown): VatBreakdown | null {
  if (!isRecord(value)) return null
  return {
    vatableSales: num(value.vatableSales),
    vatAmount: num(value.vatAmount),
    vatExemptSales: num(value.vatExemptSales),
    zeroRatedSales: num(value.zeroRatedSales),
    lessDiscounts: num(value.lessDiscounts),
  }
}

/**
 * Shape-checks a stored block. Null for anything that is not one — a reader
 * at the database edge must never trust an untyped blob, and a receipt that
 * throws is a sale that cannot be handed over.
 */
export function readStoredGovDiscount(value: unknown): StoredGovDiscount | null {
  if (!isRecord(value) || value.version !== GOV_PAYLOAD_VERSION) return null
  if (value.vatStatus !== 'vat' && value.vatStatus !== 'non_vat') return null
  if (!Array.isArray(value.claimants)) return null

  const claimants = value.claimants.map(readClaimant)
  if (claimants.some((claimant) => claimant === null)) return null

  const approval = isRecord(value.approval) &&
    typeof value.approval.approvalId === 'string' &&
    typeof value.approval.approverName === 'string'
    ? { approvalId: value.approval.approvalId, approverName: value.approval.approverName }
    : null

  return {
    version: GOV_PAYLOAD_VERSION,
    vatStatus: value.vatStatus,
    serviceChargeMode: value.serviceChargeMode === 'exempt_share' ? 'exempt_share' : 'full',
    diners: typeof value.diners === 'number' && Number.isInteger(value.diners) ? value.diners : null,
    claimants: claimants as GovClaimantResult[],
    vat: readVat(value.vat),
    approval,
  }
}
