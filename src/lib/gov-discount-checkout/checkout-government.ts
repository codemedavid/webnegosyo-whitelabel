/**
 * A Senior Citizen / PWD discount claimed at ONLINE checkout.
 *
 * JMC 01-2022 (circularized by RMC 71-2022): the customer declares their
 * status and ID number when ordering and shows the card on pickup or
 * delivery. An online order is the claimant's own purchase, so the whole
 * eligible order is theirs (take-out / delivery never splits a table).
 *
 * Only when the owner switched online claims on (`onlineClaimsEnabled`, off by
 * default): otherwise the discount is given on the register after the staff
 * see the card, and an online claim is refused here whatever the browser sent.
 *
 * The browser sends WHO is claiming — never an amount. The server prices it
 * here with the shared engine against the server-priced lines, and applies
 * the government discount OR the customer's vouchers, whichever saves more
 * (RA 9994 §4), never both. Pure: the action supplies everything it read.
 */

import { z } from 'zod'
import {
  GOV_DISCOUNT_KINDS,
  chooseDiscountRegime,
  computeGovDiscount,
  govDiscountLines,
  saleVatBreakdown,
  type GovDiscountKind,
  type StoredGovDiscount,
  type TaxProfile,
} from '@/lib/gov-discount'
import type { OrderDiscountLine } from '@/lib/order-totals'
import type { OrderDiscountPayload } from '@/lib/order-discount'

/** The one claimant an online order carries. */
export const ONLINE_CLAIMANT_ID = 'online-1'

/** Said when the store applies Senior/PWD only at the counter (the default). */
export const ONLINE_CLAIMS_OFF_MESSAGE =
  'This store applies Senior Citizen and PWD discounts in person. Show your ID when you receive your order.'

const claimSchema = z
  .object({
    kind: z.enum(GOV_DISCOUNT_KINDS as unknown as [GovDiscountKind, ...GovDiscountKind[]]),
    name: z.string().trim().min(2).max(80),
    idNumber: z.string().trim().min(3).max(30),
  })
  .strict()

export type CheckoutGovClaim = z.infer<typeof claimSchema>

/** Null for no claim or a malformed one — a bad claim never blocks an order. */
export function parseCheckoutGovClaim(value: unknown): CheckoutGovClaim | null {
  if (value === null || value === undefined) return null
  const parsed = claimSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export interface CheckoutGovItem {
  menu_item_id: string
  menu_item_name?: string
  quantity: number
  subtotal: number
}

export interface CheckoutGovInput {
  claim: CheckoutGovClaim
  items: readonly CheckoutGovItem[]
  profile: TaxProfile
  excludedMenuItemIds: ReadonlySet<string>
  serviceCharge: number
  deliveryFee: number
  /** What the customer's vouchers would take off instead. */
  otherReduction: number
}

export type CheckoutGovOutcome =
  | { status: 'refused'; message: string }
  | { status: 'outranked'; governmentReduction: number; otherReduction: number }
  | {
      status: 'applied'
      reduction: number
      lines: OrderDiscountLine[]
      government: StoredGovDiscount
      payload: OrderDiscountPayload
    }

export function priceCheckoutGovernment(input: CheckoutGovInput): CheckoutGovOutcome {
  const { claim, items, profile } = input
  if (!profile.onlineClaimsEnabled) return { status: 'refused', message: ONLINE_CLAIMS_OFF_MESSAGE }
  const lines = items.map((item, index) => ({
    key: `line-${index}`,
    name: item.menu_item_name ?? 'Item',
    quantity: Math.max(1, Math.floor(item.quantity)),
    amount: item.subtotal,
    eligible: !input.excludedMenuItemIds.has(item.menu_item_id),
  }))
  const units = Object.fromEntries(lines.filter((line) => line.eligible).map((line) => [line.key, line.quantity]))

  const result = computeGovDiscount({
    vatStatus: profile.vatStatus,
    lines,
    claimants: [
      { id: ONLINE_CLAIMANT_ID, kind: claim.kind, name: claim.name, idNumber: claim.idNumber, allocation: { mode: 'items', units } },
    ],
    allowShared: false,
    enabledKinds: profile.enabledKinds,
    serviceCharge: input.serviceCharge,
    serviceChargeMode: profile.serviceChargeMode,
    deliveryFee: input.deliveryFee,
  })
  if (!result.ok) return { status: 'refused', message: result.problems[0]?.message ?? 'The discount could not be applied.' }

  const choice = chooseDiscountRegime(result.totalReduction, input.otherReduction)
  if (choice.regime === 'other') {
    return { status: 'outranked', governmentReduction: result.totalReduction, otherReduction: input.otherReduction }
  }

  const itemsTotal = items.reduce((sum, item) => sum + item.subtotal, 0)
  const government: StoredGovDiscount = {
    version: 1,
    vatStatus: profile.vatStatus,
    serviceChargeMode: profile.serviceChargeMode,
    diners: null,
    claimants: result.claimants,
    vat: saleVatBreakdown({
      vatStatus: profile.vatStatus,
      itemsTotal,
      serviceCharge: input.serviceCharge,
      deliveryFee: input.deliveryFee,
      claimants: result.claimants,
    }),
    approval: null,
  }
  const discountLines: OrderDiscountLine[] = govDiscountLines(result.claimants).map((line) => ({
    label: line.label,
    amount: line.amount,
    isGovernment: true,
  }))
  return {
    status: 'applied',
    reduction: result.totalReduction,
    lines: discountLines,
    government,
    payload: {
      total: result.totalReduction,
      deliveryDiscount: 0,
      lines: discountLines,
      allocationsByLine: { ...result.lineReductions },
      government,
    },
  }
}
