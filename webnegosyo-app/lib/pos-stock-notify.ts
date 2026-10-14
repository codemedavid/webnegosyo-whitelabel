import { postAuthorized } from "./authorized-post";
import { responseStatusOf } from "./authorized-post-status";
import type { PosStockItem } from "./pos-stock";

/**
 * Which screen moved the stock, for the platform's inventory audit log. A
 * label, not an authority: the server checks it against a fixed list and
 * records who was signed in from the token, never from the body.
 */
export type StockAuditSource = "pos" | "qr_scan" | "merchant_app";

/**
 * What became of one stock call.
 *
 * - `ok`: the platform accepted it (or there was nothing to send).
 * - `permanent`: the platform refused it in a way a retry cannot change
 *   (400/401/403/409 — malformed, unauthorised, or e.g. "this order is not
 *   cancelled"). Retrying would only be refused again.
 * - `retry`: the call may not have happened — a timeout, a 5xx, no session,
 *   no network. The server's claims make every stock action idempotent per
 *   order, so sending it again is safe and is the only way the ledger heals.
 */
export type StockPostOutcome = "ok" | "permanent" | "retry";

const STOCK_ROUTE = "/api/inventory/order-stock";

/** Refusals that say "no" for good; anything else non-2xx is worth retrying. */
// 401 is NOT permanent: a device back online after hours can send a token that
// expired a moment ago, or lose a refresh race. Retrying lets the session
// refresh; MAX attempts still bound a credential that is genuinely dead.
const PERMANENT_STATUSES: readonly number[] = [400, 403, 409];

/**
 * Backoff between in-process attempts for a stock call no queue persists
 * (status-change restore/redeplete, an order edit's revision, a scanned QR
 * sale). About 40 seconds end to end — enough to ride out a blip, short enough
 * that a dead connection is not retried into the next shift.
 */
export const STOCK_RETRY_DELAYS_MS: readonly number[] = [2_000, 8_000, 30_000];

export function classifyStockResponse(ok: boolean, status: number | null): StockPostOutcome {
  if (ok) return "ok";
  if (status !== null && PERMANENT_STATUSES.includes(status)) return "permanent";
  return "retry";
}

/** Omitted entirely when unnamed, so the request is what it always was. */
function withSource<T extends Record<string, unknown>>(body: T, source?: StockAuditSource) {
  return source ? { ...body, source } : body;
}

/**
 * The one authenticated call every stock action shares. Never throws, and —
 * via `postAuthorized` — always settles within its deadline: the tender screen
 * awaits this before it clears its spinner, so an unbounded wait here is a
 * frozen register.
 */
async function postStockAction(body: Record<string, unknown>): Promise<StockPostOutcome> {
  const ok = await postAuthorized(STOCK_ROUTE, body);
  return classifyStockResponse(ok, responseStatusOf(body));
}

export interface StockRetryOptions {
  delaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

function sleepFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a stock call, retrying transient failures after each backoff delay.
 * Stops at the first `ok` or `permanent`; answers `retry` once every delay is
 * spent. Never throws.
 */
export async function withStockRetry(
  attempt: () => Promise<StockPostOutcome>,
  { delaysMs = STOCK_RETRY_DELAYS_MS, sleep = sleepFor }: StockRetryOptions = {},
): Promise<StockPostOutcome> {
  for (let index = 0; ; index += 1) {
    let outcome: StockPostOutcome;
    try {
      outcome = await attempt();
    } catch {
      outcome = "retry";
    }
    if (outcome !== "retry" || index >= delaysMs.length) return outcome;
    await sleep(delaysMs[index]);
  }
}

/**
 * Ask the platform to spend a counter sale's ingredients. ONE attempt; the
 * caller decides how to retry (the sales outbox persists it, see
 * `offline/sync-outbox.ts`).
 *
 * Register sales are written straight to the tenant's order backend and never
 * pass through the web app's `createOrderAction` where depletion is wired.
 * This is the register's way into that same path, so a counter sale moves
 * stock exactly like an online order does.
 *
 * Never throws: by the time this runs the sale is rung up, tendered and saved —
 * a stock write must not be able to fail the tender screen.
 */
export async function notifyPosStockDepletion(
  tenantId: string,
  orderId: string,
  items: readonly PosStockItem[],
  source?: StockAuditSource,
): Promise<StockPostOutcome> {
  if (items.length === 0) return "ok";
  return postStockAction(withSource({ tenantId, orderId, items }, source));
}

/**
 * Put a cancelled order's ingredients back on the shelf. ONE attempt.
 *
 * Sends no lines: the platform reverses the sale movements the order actually
 * recorded. The platform refuses (409) an order that is not cancelled, which
 * reads as `permanent`.
 */
export async function notifyOrderStockRestore(
  tenantId: string,
  orderId: string,
  source?: StockAuditSource,
): Promise<StockPostOutcome> {
  return postStockAction(withSource({ tenantId, orderId, action: "restore" }, source));
}

/**
 * Re-spend exactly what an order's cancellation put back, because the order
 * left `cancelled` for an active status again. ONE attempt; sends no lines.
 */
export async function notifyOrderStockRedeplete(
  tenantId: string,
  orderId: string,
  source?: StockAuditSource,
): Promise<StockPostOutcome> {
  return postStockAction(withSource({ tenantId, orderId, action: "redeplete" }, source));
}

/**
 * Move the stock a saved order edit is responsible for. ONE attempt.
 *
 * Sends only the DIFFERENCE, in both directions — one edit can add a latte and
 * drop a bun. The platform claims each direction against `revision`, so a
 * retried save is a no-op while the next edit still moves stock.
 */
export async function notifyOrderStockRevision(
  tenantId: string,
  orderId: string,
  revision: number,
  movement: { deplete: readonly PosStockItem[]; restore: readonly PosStockItem[] },
  source?: StockAuditSource,
): Promise<StockPostOutcome> {
  if (movement.deplete.length === 0 && movement.restore.length === 0) return "ok";

  return postStockAction(
    withSource(
      {
        tenantId,
        orderId,
        action: "revise",
        revision,
        deplete: movement.deplete,
        restore: movement.restore,
      },
      source,
    ),
  );
}
