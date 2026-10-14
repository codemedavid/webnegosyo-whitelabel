import { postAuthorizedDetailed } from "./authorized-post";
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
 * - `permanent`: the platform refused it in a way a retry cannot change — any
 *   4xx but the four in {@link RETRYABLE_CLIENT_STATUSES} (400 malformed, 403
 *   no permission / wrong branch, 409 e.g. "this order is not cancelled").
 *   Retrying would only be refused again.
 * - `retry`: the call may not have happened, or may succeed later — a timeout,
 *   a 5xx, 401/404/408/429, no session, no network. The server's claims make
 *   every stock action idempotent per order, so sending it again is safe and is
 *   the only way the ledger heals.
 */
export type StockPostOutcome = "ok" | "permanent" | "retry";

const STOCK_ROUTE = "/api/inventory/order-stock";

/**
 * Client errors that are NOT final — everything else in 4xx is.
 *
 * - 401: a device back online after hours can send a token that expired a
 *   moment ago, or lose a refresh race. Retrying lets the session refresh.
 * - 404 `order_not_found`: the order row may not be visible to the route yet
 *   (a sale written a moment ago, a replica catching up).
 * - 408 / 429: the server asked us to come back later.
 *
 * The attempt cap still bounds a credential or an order that is genuinely gone.
 */
const RETRYABLE_CLIENT_STATUSES: readonly number[] = [401, 404, 408, 429];

function isPermanentStatus(status: number): boolean {
  return status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.includes(status);
}

export function classifyStockResponse(ok: boolean, status: number | null): StockPostOutcome {
  if (ok) return "ok";
  if (status !== null && isPermanentStatus(status)) return "permanent";
  return "retry";
}

/** Omitted entirely when unnamed, so the request is what it always was. */
function withSource<T extends Record<string, unknown>>(body: T, source?: StockAuditSource) {
  return source ? { ...body, source } : body;
}

/**
 * The one authenticated call every stock action shares. Never throws, and —
 * via `postAuthorizedDetailed` — always settles within its deadline: the
 * tender screen awaits this before it clears its spinner, so an unbounded wait
 * here is a frozen register.
 *
 * A permanent refusal is logged with its HTTP status here, the one place that
 * still knows it; the queue holding the call reports the give-up itself.
 */
async function postStockAction(body: Record<string, unknown>): Promise<StockPostOutcome> {
  const { ok, status } = await postAuthorizedDetailed(STOCK_ROUTE, body);
  const outcome = classifyStockResponse(ok, status);
  if (outcome === "permanent") {
    console.warn(
      `[stock] The platform refused the ${String(body.action ?? "deplete")} stock call for order ` +
        `${String(body.orderId)} (store ${String(body.tenantId)}): HTTP ${status}.`,
    );
  }
  return outcome;
}

/**
 * Ask the platform to spend a sale's ingredients. ONE attempt; the caller
 * decides how to retry (a counter sale rides in the sales outbox, see
 * `offline/sync-outbox.ts`; a scanned QR sale in the stock-call queue, see
 * `offline/drain-stock-calls.ts`).
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
