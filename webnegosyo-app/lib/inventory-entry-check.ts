/**
 * "Is that really what you meant?" for stock and cost entries. Pure, no imports.
 *
 * BYTE-IDENTICAL in webnegosyo-app/lib/inventory-entry-check.ts
 * (tests/unit/inventory/entry-check.test.ts fails when they drift).
 *
 * Why: 2026-11-13 Uncle Drei's received "4000" of Salted Caramel Powder on a
 * shelf stocked in kilograms (a minute after entering another powder in
 * grams) and fixed it with a count two minutes later. Nothing asked; the
 * profit report then showed P1.45M of stock lost. Sorpresso's milk costs
 * P82 per GRAM (the price of a litre), so every latte "costs" thousands.
 *
 * A check never blocks: it names the doubt once, offers the likely fix, and
 * the merchant saves anyway with a second tap. Thresholds are deliberately
 * wide so an honest entry almost never meets one.
 */

export type EntryKind = 'receive' | 'stocktake' | 'waste'

export interface EntryUnit {
  /** The unit's abbreviation as shown ("kg", "g", "L", "ml", "pc"). */
  abbreviation: string
}

export interface StockEntryInput {
  kind: EntryKind
  /** What was typed, in `unit`. */
  quantity: number
  unit: EntryUnit
  /** On hand now, in the SAME unit as `quantity` (null = unknown). */
  onHand: number | null
}

export interface EntryDoubt {
  /** Stable id: a changed doubt needs a fresh confirmation. */
  key: string
  title: string
  message: string
  /** A one-tap fix ("Use 4 kg"), when there is an obvious one. */
  fix: { label: string; quantity?: number; cost?: number } | null
  /** The confirm button: says exactly what will be saved. */
  confirmLabel: string
}

/** Units 1,000x their everyday sibling: a gram figure typed here is 1,000x too big. */
const BIG_UNITS: Readonly<Record<string, { small: string }>> = {
  kg: { small: 'g' },
  l: { small: 'ml' },
}

/** Units small enough that a price per ONE of them is rarely more than a few pesos. */
const SMALL_UNITS: Readonly<Record<string, { big: string }>> = {
  g: { big: 'kg' },
  ml: { big: 'L' },
}

/** A kilogram or litre figure this big is a gram/ml figure (1 tonne of one ingredient). */
export const BIG_UNIT_SLIP_AT = 1000
/** A delivery or count this many times the shelf is worth a second look. */
export const SHELF_MULTIPLE_AT = 100
/** Below this nobody is surprised, whatever the shelf (a first box of 50 cups). */
const SHELF_MULTIPLE_FLOOR = 100
/** Pesos per gram / millilitre above which it is almost surely a pack or kilo price. */
export const SMALL_UNIT_PRICE_AT = 20
/** Pesos per kilogram / litre above which it is almost surely a sack or box price. */
export const BIG_UNIT_PRICE_AT = 20000

function unitKey(unit: EntryUnit): string {
  return unit.abbreviation.trim().toLowerCase()
}

function amount(value: number): string {
  return Number(value.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function pesos(value: number): string {
  return `₱${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

const VERB: Readonly<Record<EntryKind, string>> = { receive: 'Add', stocktake: 'Save', waste: 'Record' }

/** The doubt about a typed quantity, or null when it looks ordinary. */
export function checkStockEntry(input: StockEntryInput): EntryDoubt | null {
  const { kind, quantity, unit, onHand } = input
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  const abbreviation = unit.abbreviation.trim()
  const typed = `${amount(quantity)} ${abbreviation}`
  const big = BIG_UNITS[unitKey(unit)]

  if (big && quantity >= BIG_UNIT_SLIP_AT && kind !== 'waste') {
    const meant = quantity / 1000
    return {
      key: `slip:${kind}:${quantity}:${unitKey(unit)}`,
      title: `${typed}? That is ${amount(meant)} tonne${meant === 1 ? '' : 's'}.`,
      message: `This ingredient is kept in ${abbreviation}. If you weighed ${amount(quantity)} ${big.small}, that is ${amount(meant)} ${abbreviation}.`,
      fix: { label: `Use ${amount(meant)} ${abbreviation}`, quantity: meant },
      confirmLabel: `Yes, ${VERB[kind].toLowerCase()} ${typed}`,
    }
  }

  const shelf = onHand ?? 0
  if (kind !== 'waste' && shelf > 0 && quantity >= SHELF_MULTIPLE_FLOOR && quantity >= shelf * SHELF_MULTIPLE_AT) {
    const times = Math.floor(quantity / shelf)
    return {
      key: `shelf:${kind}:${quantity}:${unitKey(unit)}`,
      title: `${typed} is ${times.toLocaleString('en-US')}× what is on the shelf.`,
      message: `The shelf shows ${amount(shelf)} ${abbreviation}. Check the amount and the unit before you save.`,
      fix: null,
      confirmLabel: `Yes, ${VERB[kind].toLowerCase()} ${typed}`,
    }
  }
  return null
}

/** The doubt about a price per `unit`, or null when it looks ordinary. */
export function checkUnitCost(cost: number, unit: EntryUnit): EntryDoubt | null {
  if (!Number.isFinite(cost) || cost <= 0) return null
  const abbreviation = unit.abbreviation.trim()
  const small = SMALL_UNITS[unitKey(unit)]
  if (small && cost > SMALL_UNIT_PRICE_AT) {
    const perBig = cost * 1000
    return {
      key: `price-small:${cost}:${unitKey(unit)}`,
      title: `${pesos(cost)} for ONE ${abbreviation}?`,
      message: `That makes 1 ${small.big} cost ${pesos(perBig)}. If ${pesos(cost)} is the price of a ${small.big} or a pack, enter it per ${abbreviation}: divide by how many ${abbreviation} it holds.`,
      fix: { label: `Use ${pesos(cost / 1000)} per ${abbreviation} (${pesos(cost)} per ${small.big})`, cost: cost / 1000 },
      confirmLabel: `Yes, ${pesos(cost)} per ${abbreviation}`,
    }
  }
  if (BIG_UNITS[unitKey(unit)] && cost > BIG_UNIT_PRICE_AT) {
    return {
      key: `price-big:${cost}:${unitKey(unit)}`,
      title: `${pesos(cost)} for ONE ${abbreviation}?`,
      message: `That is the price of a sack or a box, not of 1 ${abbreviation}. Divide it by how many ${abbreviation} it holds.`,
      fix: null,
      confirmLabel: `Yes, ${pesos(cost)} per ${abbreviation}`,
    }
  }
  return null
}

/** The first doubt about a delivery / count / waste entry: quantity first, then its price. */
export function checkMovementEntry(input: StockEntryInput & { unitCost?: number | null }): EntryDoubt | null {
  const quantityDoubt = checkStockEntry(input)
  if (quantityDoubt) return quantityDoubt
  return input.kind === 'receive' && input.unitCost != null ? checkUnitCost(input.unitCost, input.unit) : null
}
