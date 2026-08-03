/**
 * Codes in, priced discount out.
 *
 * The seam between what a customer typed and the pure engine. Every surface
 * goes through here — the checkout preview, the server's authoritative
 * re-price, and the register — so the number shown and the number charged come
 * from one place.
 *
 * Data access is injected rather than imported. The engine stays pure, this
 * layer stays testable without a database, and the merchant app can supply its
 * own lookup when the engine is ported.
 */

import { applyVouchers, type VoucherApplication, type RejectedVoucher } from './stacking'
import type { DiscountContext, Voucher } from './types'

export interface VoucherLookup {
  /** Vouchers matching these already-normalized codes, scoped to one tenant. */
  findByCodes(tenantId: string, codes: readonly string[]): Promise<readonly Voucher[]>
  /**
   * Redemptions this customer has already made, keyed by voucher id. Only
   * called when a customer key is known — a guest has no history to count.
   */
  countCustomerRedemptions(
    tenantId: string,
    voucherIds: readonly string[],
    customerKey: string,
  ): Promise<Readonly<Record<string, number>>>
}

export interface ResolveVouchersInput {
  tenantId: string
  /** Raw, as typed. Trimmed, upper-cased and de-duplicated here. */
  codes: readonly string[]
  context: DiscountContext
  /** Normalized customer identity. Absent for guests. */
  customerKey?: string | null
  lookup: VoucherLookup
}

export interface ResolvedVouchers extends VoucherApplication {
  /** Codes that matched no voucher for this tenant. */
  notFound: readonly string[]
}

const EMPTY_RESULT: ResolvedVouchers = {
  applied: [],
  rejected: [],
  discountLines: [],
  discountTotal: 0,
  deliveryDiscount: 0,
  allocationsByLine: {},
  notFound: [],
}

/**
 * Trim, upper-case, drop blanks, and collapse duplicates — while keeping the
 * customer's order of entry, which is what decides a solo-only conflict.
 */
function normalizeCodes(codes: readonly string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const raw of codes) {
    if (typeof raw !== 'string') continue
    const code = raw.trim().toUpperCase()
    if (code === '' || seen.has(code)) continue
    seen.add(code)
    normalized.push(code)
  }

  return normalized
}

export async function resolveVouchers(input: ResolveVouchersInput): Promise<ResolvedVouchers> {
  const codes = normalizeCodes(input.codes)
  if (codes.length === 0) return EMPTY_RESULT

  const found = await input.lookup.findByCodes(input.tenantId, codes)

  const byCode = new Map(found.map((voucher) => [voucher.code.trim().toUpperCase(), voucher]))

  // Entry order, not database order. `applyVouchers` resolves a solo-only
  // conflict in favour of whichever it sees first.
  const requested = codes.map((code) => byCode.get(code)).filter((v): v is Voucher => v != null)
  const notFound = codes.filter((code) => !byCode.has(code))

  const { eligible, overLimit } = await partitionByCustomerLimit(input, requested)

  const application = applyVouchers(eligible, input.context)

  return {
    ...application,
    // Order the rejections the way the customer entered them: not-found and
    // over-limit codes are as much a part of the answer as the engine's own.
    rejected: orderRejections(codes, [...application.rejected, ...overLimit, ...missing(notFound)]),
    notFound,
  }
}

function missing(codes: readonly string[]): RejectedVoucher[] {
  return codes.map((code) => ({
    voucherId: '',
    code,
    reason: 'not_found' as const,
    message: 'That voucher code was not recognised.',
  }))
}

function orderRejections(
  codes: readonly string[],
  rejected: readonly RejectedVoucher[],
): RejectedVoucher[] {
  return [...rejected].sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code))
}

/**
 * The per-customer limit is checked here rather than inside `applyVouchers`
 * because `DiscountContext` carries one `customerUsageCount` for the whole
 * evaluation while the limit is per voucher. Splitting the list before the
 * engine sees it is the only way to hold both without changing the engine's
 * tested contract.
 */
async function partitionByCustomerLimit(
  input: ResolveVouchersInput,
  requested: readonly Voucher[],
): Promise<{ eligible: Voucher[]; overLimit: RejectedVoucher[] }> {
  const customerKey = input.customerKey?.trim()
  const limited = requested.filter((v) => v.usageLimitPerCustomer != null)

  if (!customerKey || limited.length === 0) {
    return { eligible: [...requested], overLimit: [] }
  }

  const counts = await input.lookup.countCustomerRedemptions(
    input.tenantId,
    limited.map((v) => v.id),
    customerKey,
  )

  const eligible: Voucher[] = []
  const overLimit: RejectedVoucher[] = []

  for (const voucher of requested) {
    const limit = voucher.usageLimitPerCustomer
    const used = counts[voucher.id] ?? 0

    if (limit != null && used >= limit) {
      overLimit.push({
        voucherId: voucher.id,
        code: voucher.code,
        reason: 'customer_limit_reached',
        // Matches the engine's own wording for the same rejection.
        message: 'You have already used this voucher.',
      })
      continue
    }

    eligible.push(voucher)
  }

  return { eligible, overLimit }
}
