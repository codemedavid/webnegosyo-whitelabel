/**
 * The boundary between a merchant-app sale and the customer profile system.
 *
 * Every customer-capture call site — `upsertCustomerFromOrder` and
 * `captureExternalOrderBestEffort` — lives in this Next.js app, reached from
 * `createOrderAction` and `orders-service`. The merchant app writes its orders
 * straight to Convex or to the platform Supabase through its own adapter, so it
 * passes through none of them: until now, an order rung up on the register built
 * no customer profile at all. Every counter sale was invisible to the Regulars
 * list, however carefully the cashier typed the guest's number in.
 *
 * `POST /api/customers/capture-order` is the register's way into the same
 * orchestration, and this module is where its untrusted body is turned into
 * something safe to hand over. Two principles shape the rules below:
 *
 * - **A malformed detail must not cost the merchant the guest.** An unreadable
 *   total, a garbage line item, a missing name — each degrades to a sane value
 *   rather than rejecting the capture. Only the facts that identify *which
 *   order this is* are hard requirements, because getting those wrong corrupts
 *   the ledger rather than merely thinning it.
 * - **The caller states contact details, never a customer.** Identity resolution
 *   is the server's job, exactly as it is for a web checkout.
 */

/**
 * Which database the order itself lives in.
 *
 * `platform` orders live in `public.orders` and link by `orders.customer_id`;
 * the other two are foreign and roll through the `customer_external_orders`
 * ledger instead. Part of that ledger's identity key, which is why an
 * unrecognized value is refused rather than defaulted — the same order arriving
 * later under its real backend would be counted a second time.
 */
export type CaptureBackend = 'platform' | 'convex' | 'tenant_supabase'

const CAPTURE_BACKENDS: readonly CaptureBackend[] = ['platform', 'convex', 'tenant_supabase']

/** One line of the sale, as the profile aggregate consumes it. */
export interface CaptureItem {
  name: string
  quantity: number
}

/** A validated capture instruction. Deliberately has no `customerId` field. */
export interface CustomerCaptureRequest {
  tenantId: string
  backend: CaptureBackend
  /** The order's id in whichever backend wrote it. */
  orderId: string
  name: string | null
  contact: string | null
  /** Untyped blob; the shared resolver reads phone/email out of it structurally. */
  customerData: unknown
  total: number
  /** ISO string, epoch ms, or null when the server should stamp its own. */
  createdAt: string | number | null
  channel: string | null
  items: CaptureItem[]
}

export type CustomerCaptureParse =
  | { ok: true; value: CustomerCaptureRequest }
  | { ok: false; error: string }

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * A total that is always a usable number.
 *
 * An unreadable total understates the guest's lifetime spend by one order.
 * Refusing the capture loses the guest entirely — the worse of the two, and
 * recoverable later by a backfill in a way a missing profile is not.
 */
function toTotal(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

/**
 * The order's timestamp, or null to let the server stamp its own.
 *
 * Epoch milliseconds are accepted because that is what Convex's `_creationTime`
 * reports. A missing value deliberately does NOT fall back to a client-supplied
 * default: till clocks are routinely wrong, and a bad one would file the sale in
 * the wrong month of the guest's history.
 */
function toCreatedAt(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return trimmedOrNull(value)
}

/** Well-formed lines only. One unreadable line must not cost the whole capture. */
function toItems(value: unknown): CaptureItem[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { name, quantity } = entry as { name?: unknown; quantity?: unknown }
    const cleanName = trimmedOrNull(name)
    const cleanQuantity = Number(quantity)
    if (cleanName === null || !Number.isFinite(cleanQuantity) || cleanQuantity <= 0) return []
    return [{ name: cleanName, quantity: cleanQuantity }]
  })
}

export function parseCustomerCaptureRequest(body: unknown): CustomerCaptureParse {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'A JSON object body is required.' }
  }

  const raw = body as Record<string, unknown>

  const tenantId = trimmedOrNull(raw.tenantId)
  if (tenantId === null) return { ok: false, error: 'tenantId is required.' }

  const orderId = trimmedOrNull(raw.orderId)
  if (orderId === null) return { ok: false, error: 'orderId is required.' }

  const backend = raw.backend
  if (typeof backend !== 'string' || !CAPTURE_BACKENDS.includes(backend as CaptureBackend)) {
    return { ok: false, error: `backend must be one of ${CAPTURE_BACKENDS.join(', ')}.` }
  }

  return {
    ok: true,
    value: {
      tenantId,
      backend: backend as CaptureBackend,
      orderId,
      name: trimmedOrNull(raw.name),
      contact: trimmedOrNull(raw.contact),
      customerData: raw.customerData ?? null,
      total: toTotal(raw.total),
      createdAt: toCreatedAt(raw.createdAt),
      channel: trimmedOrNull(raw.channel),
      items: toItems(raw.items),
      // No `customerId`, by construction rather than by omission: the caller
      // supplies contact details and the server resolves who that is. Accepting
      // an id would let a register link its sale to any uuid — another tenant's
      // guest included — and the next profile recompute would restate that
      // stranger's lifetime totals as if the sale were theirs.
    },
  }
}
