/**
 * The discounts Philippine law makes a restaurant give, as data.
 *
 * Adding a kind is one entry here (plus its key in `GovDiscountKind`): the
 * register's tiles, the receipt codes, the sales-book exports and the settings
 * switches all read this table.
 *
 * Deliberately absent:
 * - Solo parents (RA 11861): the 10% covers baby milk, diapers and medicine at
 *   groceries and drugstores, not restaurant meals.
 * - Diplomats: zero-rating needs a case-by-case BIR certificate.
 * - Students: no national rule for food.
 */

import type { GovDiscountKind, VatTreatment } from './types'

export interface GovDiscountRule {
  kind: GovDiscountKind
  /** Shown on the register tile. */
  label: string
  /** Receipt / sales-book code. */
  code: 'SC' | 'PWD' | 'NAAC' | 'MOV'
  /** Percent off, as a whole number. */
  ratePercent: number
  vatTreatment: VatTreatment
  /** What the cashier asks for. */
  idLabel: string
  /** Placeholder for the ID field. */
  idPlaceholder: string
  /** The law, for the settings screen and the receipt fine print. */
  law: string
  /** On unless the owner turns it off. Senior and PWD are always owed. */
  isOnByDefault: boolean
  /** Shown beside the switch in settings when the treatment is unsettled. */
  caution?: string
}

export const GOV_DISCOUNT_RULES: Readonly<Record<GovDiscountKind, GovDiscountRule>> = {
  senior: {
    kind: 'senior',
    label: 'Senior Citizen',
    code: 'SC',
    ratePercent: 20,
    vatTreatment: 'exempt',
    idLabel: 'OSCA / Senior Citizen ID no.',
    idPlaceholder: 'e.g. 12345',
    law: 'RA 9994 · RR 7-2010',
    isOnByDefault: true,
  },
  pwd: {
    kind: 'pwd',
    label: 'PWD',
    code: 'PWD',
    ratePercent: 20,
    vatTreatment: 'exempt',
    idLabel: 'PWD ID no.',
    idPlaceholder: 'e.g. 13-7404-000-0001234',
    law: 'RA 10754 · RR 5-2017',
    isOnByDefault: true,
  },
  athlete: {
    kind: 'athlete',
    label: 'National Athlete / Coach',
    code: 'NAAC',
    ratePercent: 20,
    vatTreatment: 'charged_on_discounted',
    idLabel: 'PNSTM ID no.',
    idPlaceholder: 'PNSTM ID number',
    law: 'RA 10699 · RR 13-2020',
    isOnByDefault: false,
    caution: 'Ask your accountant to confirm the VAT treatment before turning this on.',
  },
  medal_of_valor: {
    kind: 'medal_of_valor',
    label: 'Medal of Valor',
    code: 'MOV',
    ratePercent: 20,
    vatTreatment: 'charged_on_discounted',
    idLabel: 'Medal of Valor / dependent ID no.',
    idPlaceholder: 'ID number',
    law: 'RA 9049',
    isOnByDefault: false,
    caution: 'Ask your accountant to confirm the VAT treatment before turning this on.',
  },
}

/** Every kind, in the order the register shows them. */
export const GOV_DISCOUNT_KINDS: readonly GovDiscountKind[] = [
  'senior',
  'pwd',
  'athlete',
  'medal_of_valor',
]

export const DEFAULT_ENABLED_KINDS: readonly GovDiscountKind[] = GOV_DISCOUNT_KINDS.filter(
  (kind) => GOV_DISCOUNT_RULES[kind].isOnByDefault,
)

/** Narrowing for values read back from storage or a request body. */
export function isGovDiscountKind(value: unknown): value is GovDiscountKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GOV_DISCOUNT_RULES, value)
}

/** Senior and PWD can never be switched off — refusing them is a crime. */
export function isMandatoryKind(kind: GovDiscountKind): boolean {
  return kind === 'senior' || kind === 'pwd'
}

/** The kinds a store offers: the mandatory two plus whatever it switched on. */
export function effectiveEnabledKinds(
  configured: readonly unknown[] | null | undefined,
): GovDiscountKind[] {
  const chosen = new Set((configured ?? DEFAULT_ENABLED_KINDS).filter(isGovDiscountKind))
  return GOV_DISCOUNT_KINDS.filter((kind) => isMandatoryKind(kind) || chosen.has(kind))
}
