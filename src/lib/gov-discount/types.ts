/**
 * Government-mandated discounts (Senior Citizen, PWD, national athletes,
 * Medal of Valor) — the shared vocabulary.
 *
 * This folder is the ONE place the arithmetic lives. The web (online checkout,
 * the server that verifies every grant, the BIR exports) and the merchant app
 * (the register, which must work offline) run the same files: the app's copy
 * under `webnegosyo-app/lib/gov-discount/` is pinned BYTE-IDENTICAL by
 * `tests/unit/gov-discount/engine-parity.test.ts`. Keep these modules free of
 * Supabase, Convex, React and path aliases so they stay portable.
 *
 * Money crosses the API in pesos (numbers with up to two decimals, like every
 * other order field); inside, everything is integer centavos.
 */

/** Who the discount is for. Keys are stored — never rename one. */
export type GovDiscountKind = 'senior' | 'pwd' | 'athlete' | 'medal_of_valor'

/** A store's BIR registration, which decides whether VAT is removed first. */
export type VatStatus = 'vat' | 'non_vat'

/**
 * What happens to the claimant's share of a service charge.
 * `full`: charged in full on the pre-discount bill (the default).
 * `exempt_share`: their pro-rata share is VAT-exempt (VAT stores only).
 */
export type ServiceChargeMode = 'full' | 'exempt_share'

/**
 * How a rule treats VAT at a VAT-registered store.
 * `exempt`: no VAT on their share at all (Senior, PWD).
 * `charged_on_discounted`: 20% comes off the VAT-exclusive price and VAT is
 * then charged on what is left (national athletes and coaches, RR 13-2020).
 */
export type VatTreatment = 'exempt' | 'charged_on_discounted'

/** One cart line as the engine needs it. */
export interface GovLineInput {
  /** Stable key for the line (the register's cart key, or `line-<index>`). */
  key: string
  name: string
  /** Whole units on the line. */
  quantity: number
  /** The line's VAT-inclusive subtotal in pesos (unit price × quantity). */
  amount: number
  /** False for items the store excluded (e.g. retail merchandise). */
  eligible: boolean
}

/**
 * Which part of the bill belongs to a claimant.
 *
 * `items`: the units they ordered for themselves, by line key. "Dining alone"
 * is just every unit of every eligible line.
 * `shared`: a shared table — their share is the shared food divided by the
 * number of diners (DSWD/NCMB Res. 3-2009). Every shared claimant at a table
 * uses the same headcount.
 */
export type GovAllocation =
  | { mode: 'items'; units: Readonly<Record<string, number>> }
  | { mode: 'shared' }

export interface GovClaimantInput {
  /** Client-generated id; stable across edits so the ledger can follow it. */
  id: string
  kind: GovDiscountKind
  name: string
  idNumber: string
  allocation: GovAllocation
}

export interface GovDiscountInput {
  vatStatus: VatStatus
  lines: readonly GovLineInput[]
  claimants: readonly GovClaimantInput[]
  /** People at the table. Required when any claimant is `shared`. */
  diners?: number
  /** False for take-out and delivery, where only their own serving counts. */
  allowShared?: boolean
  /** Kinds the store has switched on. Defaults to every kind. */
  enabledKinds?: readonly GovDiscountKind[]
  /** The service charge levied on the sale, in pesos. */
  serviceCharge?: number
  serviceChargeMode?: ServiceChargeMode
  /** Delivery fee in pesos — never discounted, VATable at a VAT store. */
  deliveryFee?: number
}

/** One claimant's slice of the sale, in pesos. */
export interface GovClaimantResult {
  id: string
  kind: GovDiscountKind
  name: string
  /** Normalised (trimmed, upper-cased) ID number. */
  idNumber: string
  allocation: GovAllocation
  /** Their share of the food, VAT-inclusive, before anything comes off. */
  grossShare: number
  /** The VAT-exclusive base their share is sold at (VAT stores only). */
  vatExemptSales: number
  /** VAT not charged on their share. */
  vatRemoved: number
  /** The 20% itself. */
  discount: number
  /** What their share costs after everything. */
  netDue: number
  /** Their share of the service charge (only counted under `exempt_share`). */
  serviceChargeShare: number
  /** VAT removed from that service-charge share. */
  serviceChargeVatRemoved: number
  /** Everything taken off the bill for them: VAT + discount + service VAT. */
  reduction: number
  /** How much of the food reduction sits on each line, by line key. */
  lineReductions: Readonly<Record<string, number>>
}

/** The invoice's VAT block (VAT-registered stores only). */
export interface VatBreakdown {
  vatableSales: number
  vatAmount: number
  vatExemptSales: number
  zeroRatedSales: number
  /** Discounts printed under "Less:" (Senior/PWD 20%) — see `sale-vat.ts`. */
  lessDiscounts: number
}

export type GovProblemCode =
  | 'kind_disabled'
  | 'name_missing'
  | 'id_missing'
  | 'id_invalid'
  | 'id_duplicate'
  | 'nothing_assigned'
  | 'units_invalid'
  | 'units_exceed'
  | 'ineligible_line'
  | 'shared_not_allowed'
  | 'diners_missing'
  | 'diners_too_few'
  | 'nothing_eligible'

export interface GovProblem {
  code: GovProblemCode
  /** The claimant it is about, when it is about one. */
  claimantId?: string
  /** Plain words for a cashier — shown as-is. */
  message: string
}

export type GovDiscountResult =
  | {
      ok: true
      claimants: readonly GovClaimantResult[]
      /** Everything taken off the bill, all claimants together. */
      totalReduction: number
      /** Food reduction per line key, all claimants together. */
      lineReductions: Readonly<Record<string, number>>
      /** Soft notices (e.g. an ID that does not look like a PWD ID). */
      warnings: readonly GovProblem[]
    }
  | { ok: false; problems: readonly GovProblem[] }
