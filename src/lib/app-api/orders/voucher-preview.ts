import type { AppProfile, AppVoucherPreview, AppVoucherPreviewRequest } from '@/lib/app-contract'
import type { CartLineOrderItem } from '@/lib/checkout/order-items-payload'
import type { OrderVoucherPricingInput } from '@/lib/checkout/place-order/pricing'
import { resolveOrderContact } from '@/lib/customer-identity'
import { computeServiceCharge } from '@/lib/order-service-charge'
import type { PricedOrder } from '@/lib/vouchers/order-pricing'
import { normalizeVoucherCodes, type VoucherLookup } from '@/lib/vouchers/resolve'
import type { Voucher } from '@/lib/vouchers/types'
import type { OrderType } from '@/types/database'
import { draftToOrderLines } from './draft-to-lines'
import type { DraftRequest, DraftTenant, LoadedDraft } from './load-draft'
import { buildAppCustomerData, chooseOrderType, ORDER_TYPE_GONE } from './order-request'
import { failOutcome, okOutcome, type AppOutcome } from './outcome'
import { SIGNED_OUT, STORE_UNAVAILABLE } from './place-app-order'

/**
 * POST /vouchers/preview, without HTTP. The bag is translated and priced by
 * the server exactly as an order would be (`draftToOrderLines` → engine line
 * pricing), then the code goes through the engine's OWN voucher step
 * (`priceOrderVouchers`: same channel, customer key, branch and category map),
 * so the preview is the number the order will charge. Delivery is not part of
 * the request, so a free-delivery code is answered with that explained.
 */

export const CODE_NOT_VALID = "That code isn't valid at this store."
export const DELIVERY_CODE_LATER = 'This code takes money off delivery. It comes off once your delivery fee is set at checkout.'
const PRICES_UNAVAILABLE = 'We could not price your bag right now. Please try again in a moment.'

export type PriceLinesResult =
  | { ok: true; lines: CartLineOrderItem[]; itemsSubtotal: number }
  | { ok: false; refused: boolean; error: string }

export interface VoucherPreviewDeps {
  readTenant: (tenantId: string) => Promise<DraftTenant | null>
  loadDraft: (tenant: DraftTenant, request: DraftRequest) => Promise<LoadedDraft>
  readOrderTypes: (tenantId: string) => Promise<OrderType[]>
  readProfile: (tenantId: string, customerId: string) => Promise<AppProfile | null>
  priceLines: (tenant: DraftTenant, lines: CartLineOrderItem[], outletId: string | null) => Promise<PriceLinesResult>
  /** The engine's voucher step, bound to the service-role client. */
  priceVouchers: (input: Omit<OrderVoucherPricingInput, 'db'>) => Promise<PricedOrder>
  voucherLookup: () => VoucherLookup
}

export interface VoucherPreviewInput {
  tenantId: string
  customerId: string
  request: AppVoucherPreviewRequest
}

/** The lookup the engine uses, remembering which vouchers it found (for the name and the active check). */
function recordingLookup(base: VoucherLookup) {
  const found: Voucher[] = []
  const lookup: VoucherLookup = {
    findByCodes: async (tenantId, codes) => {
      const vouchers = await base.findByCodes(tenantId, codes)
      found.push(...vouchers)
      return vouchers
    },
    countCustomerRedemptions: (tenantId, ids, key) => base.countCustomerRedemptions(tenantId, ids, key),
  }
  return { lookup, found: () => [...found] }
}

function labelOf(voucher: Voucher): string {
  return voucher.name?.trim() || voucher.description?.trim() || voucher.code
}

/** The engine's verdict on the one code, in the contract's words. */
export function toVoucherPreview(voucher: Voucher, priced: PricedOrder, orderKind: string): AppOutcome<AppVoucherPreview> {
  if (!voucher.isActive) return failOutcome('not_found', CODE_NOT_VALID)
  const base = { code: voucher.code, label: labelOf(voucher) }
  const applied = priced.application.applied.find((entry) => entry.voucher.id === voucher.id)
  if (applied && applied.result.amount > 0) return okOutcome({ ...base, isApplied: true, discount: applied.result.amount, reason: null })
  const rejection = priced.application.rejected.find((entry) => entry.voucherId === voucher.id)
  if (rejection?.reason === 'inactive' || rejection?.reason === 'not_found') return failOutcome('not_found', CODE_NOT_VALID)
  const reason =
    rejection?.reason === 'no_delivery_fee' && orderKind === 'delivery'
      ? DELIVERY_CODE_LATER
      : rejection?.message || 'This code does not take anything off this bag yet.'
  return okOutcome({ ...base, isApplied: false, discount: 0, reason })
}

type Bag = { ok: true; lines: CartLineOrderItem[]; itemsSubtotal: number; outletId: string | null } | { ok: false; outcome: AppOutcome<AppVoucherPreview> }

async function priceBag(tenant: DraftTenant, request: AppVoucherPreviewRequest, deps: VoucherPreviewDeps): Promise<Bag> {
  const loaded = await deps.loadDraft(tenant, { lines: request.lines, outletId: request.outletId })
  if (!loaded.ok) return { ok: false, outcome: failOutcome('refused', loaded.error) }
  const lines = draftToOrderLines(loaded.input)
  if (!lines.ok) return { ok: false, outcome: failOutcome('refused', lines.error) }
  const outletId = loaded.outlet?.id ?? null
  const priced = await deps.priceLines(tenant, lines.lines, outletId)
  if (!priced.ok) return { ok: false, outcome: failOutcome(priced.refused ? 'refused' : 'unavailable', priced.refused ? priced.error : PRICES_UNAVAILABLE) }
  return { ok: true, lines: priced.lines, itemsSubtotal: priced.itemsSubtotal, outletId }
}

export async function previewAppVoucher(input: VoucherPreviewInput, deps: VoucherPreviewDeps): Promise<AppOutcome<AppVoucherPreview>> {
  const { tenantId, customerId, request } = input
  const tenant = await deps.readTenant(tenantId)
  if (!tenant) return failOutcome('unavailable', STORE_UNAVAILABLE)
  const [profile, orderTypes] = await Promise.all([deps.readProfile(tenantId, customerId), deps.readOrderTypes(tenantId)])
  if (!profile) return failOutcome('unauthorized', SIGNED_OUT)
  const orderType = chooseOrderType(orderTypes, request.orderTypeId)
  if (!orderType) return failOutcome('refused', ORDER_TYPE_GONE)

  const bag = await priceBag(tenant, request, deps)
  if (!bag.ok) return bag.outcome

  const customerData = buildAppCustomerData(profile, null, '')
  const recorder = recordingLookup(deps.voucherLookup())
  const priced = await deps.priceVouchers({
    tenantId,
    items: bag.lines,
    deliveryFee: undefined,
    serviceCharge: computeServiceCharge(orderType.row, bag.itemsSubtotal),
    voucherCodes: [request.code],
    outletId: bag.outletId,
    customerKey: resolveOrderContact({ name: profile.name, contact: profile.phoneE164, customerData }) || null,
    lookup: recorder.lookup,
  })
  const [code] = normalizeVoucherCodes([request.code])
  const voucher = recorder.found().find((candidate) => candidate.code.trim().toUpperCase() === code)
  return voucher ? toVoucherPreview(voucher, priced, orderType.kind) : failOutcome('not_found', CODE_NOT_VALID)
}
