/**
 * Retrying the checkout's order save.
 *
 * The web checkout is optimistic — it shows "Order Placed!" before the row
 * exists — so a save that fails once is a lost order that nobody hears about.
 * `createOrderAction` carries a `client_order_id` that the server dedupes on,
 * which is what makes retrying safe here.
 *
 * Every failure is retried EXCEPT one the server explicitly marks `refused`.
 * Guessing a refusal from an error string was never safe, so this used to
 * retry everything and accept the wasted wait. The server now says which it
 * is, and the two deserve opposite treatment: a deterministic "no" re-sent
 * three times just recomputes the same answer while the customer waits out the
 * whole backoff budget, whereas a transient failure abandoned after one try
 * costs the merchant a real order.
 *
 * The discriminator fails closed. Anything short of `refused === true` — an
 * older backend, a thrown error, a bare `{ success: false }` — keeps exactly
 * the retry behaviour it has today.
 */

export interface OrderSaveOutcome {
  success: boolean
  /** True only when the store deliberately said no. See the header. */
  refused?: boolean
  error?: string
}

export interface DurableSaveResult {
  ok: boolean
  attempts: number
  /** Carried out so the caller can show the store's own sentence. */
  refused?: boolean
  error?: string
}

export interface DurableSaveOptions {
  attempts?: number
  backoffMs?: readonly number[]
  sleep?: (ms: number) => Promise<void>
}

/** Three tries: the original plus two retries. */
export const DEFAULT_SAVE_ATTEMPTS = 3

/**
 * Waits before each retry. The total (1.6s) stays under the countdown the
 * customer is already watching, so retrying never turns the confirmation
 * screen into a spinner.
 */
export const DEFAULT_BACKOFF_MS: readonly number[] = [400, 1200]

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Runs `save` until it reports success or the attempt budget is spent.
 * `save` receives the 1-based attempt number so callers can log it.
 */
export async function saveOrderDurably(
  save: (attempt: number) => Promise<OrderSaveOutcome>,
  options: DurableSaveOptions = {}
): Promise<DurableSaveResult> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_SAVE_ATTEMPTS)
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS
  const sleep = options.sleep ?? defaultSleep

  let lastError: string | undefined

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const outcome = await save(attempt)
      if (outcome?.success) return { ok: true, attempts: attempt }
      lastError = outcome?.error

      // A refusal is the same answer however many times it is asked.
      if (outcome?.refused === true) {
        return {
          ok: false,
          attempts: attempt,
          refused: true,
          ...(lastError ? { error: lastError } : {}),
        }
      }
    } catch (error) {
      lastError = describe(error)
    }

    const isLastAttempt = attempt === attempts
    if (!isLastAttempt) {
      // Reuse the final delay once the table is exhausted.
      const wait = backoff[attempt - 1] ?? backoff[backoff.length - 1] ?? 0
      await sleep(wait)
    }
  }

  return { ok: false, attempts, ...(lastError ? { error: lastError } : {}) }
}

/**
 * The tenant fields that decide which order backend a save lands in.
 * Mirrors `OrderBackendTenantFields`, kept structural so this module stays
 * free of server-side imports.
 */
export interface OrderBackendFields {
  order_backend?: 'auto' | 'convex' | 'supabase' | 'platform' | null
  convex_deployment_url?: string | null
}

/**
 * Whether `createOrderAction` may be retried for this tenant.
 *
 * Only the shared platform Supabase backend dedupes on `client_order_id`
 * (partial unique index `orders_tenant_client_order_id_uq`). The Convex path
 * never forwards the id despite the mutation supporting it, and a tenant's own
 * Supabase project has no idempotency at all — on both, a retry creates a
 * second live order and re-burns vouchers, re-depletes stock and re-notifies.
 *
 * So this fails closed: anything we cannot positively prove is on the platform
 * backend gets a single attempt, which is exactly today's behaviour.
 */
export function isOrderSaveRetrySafe(tenant: OrderBackendFields | null | undefined): boolean {
  if (!tenant) return false

  const backend = tenant.order_backend
  if (backend === 'platform') return true
  if (backend === 'convex' || backend === 'supabase') return false

  // 'auto' (or unset) resolves the same way the server does: Convex when a
  // deployment URL is set, platform otherwise. A projection that never selected
  // the column reads as `undefined`, which is not proof of absence — refuse.
  if (!('convex_deployment_url' in tenant)) return false
  const convexUrl = tenant.convex_deployment_url
  if (convexUrl === undefined) return false
  return !(typeof convexUrl === 'string' && convexUrl.trim() !== '')
}
