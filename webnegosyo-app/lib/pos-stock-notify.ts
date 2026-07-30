import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { PosStockItem } from "./pos-stock";

function getWebAppUrl(): string {
  return Constants.expoConfig?.extra?.webAppUrl ?? "https://webnegosyo.com";
}

/**
 * Fire-and-forget: ask the platform to spend a counter sale's ingredients.
 *
 * Register sales are written straight to the tenant's Convex deployment, which
 * never passes through the web app's `createOrderAction` where depletion is
 * wired. This is the register's way into that same path, so a counter sale
 * moves stock exactly like an online order does.
 *
 * Never throws. By the time this runs the sale is rung up, tendered, and
 * saved — a stock write must not be able to fail the tender screen or make a
 * paid order look unsuccessful to the cashier. Failures leave the ledger short,
 * which a stocktake reconciles; a register that will not close a sale does not
 * reconcile.
 */
export async function notifyPosStockDepletion(
  tenantId: string,
  orderId: string,
  items: readonly PosStockItem[],
): Promise<void> {
  if (items.length === 0) return;
  await postStockAction({ tenantId, orderId, items });
}

/**
 * Fire-and-forget: put a cancelled order's ingredients back on the shelf.
 *
 * Covers every order this app can cancel — a voided counter sale and an online
 * order cancelled from the order detail screen alike. Both live in Convex and
 * so never reach `updateOrderStatus`, where the web app restores stock.
 *
 * Sends no lines: the platform reverses the sale movements the order actually
 * recorded. Recomputing from lines would drift once options are counted.
 *
 * Never throws, for the same reason as depletion — a stock write must not be
 * able to make an order un-cancellable.
 */
export async function notifyOrderStockRestore(
  tenantId: string,
  orderId: string,
): Promise<void> {
  await postStockAction({ tenantId, orderId, action: "restore" });
}

/**
 * Fire-and-forget: move the stock a saved order edit is responsible for.
 *
 * Sends only the DIFFERENCE, in both directions — one edit can add a latte and
 * drop a bun. The platform claims each direction against `revision`, so a
 * retried save is a no-op while the next edit still moves stock.
 *
 * Never throws, for the same reason as depletion: by the time this runs the
 * bill has been rewritten and the money settled. A drifting ledger is
 * reconcilable by stocktake; a save that fails after the customer has paid the
 * difference is not.
 */
export async function notifyOrderStockRevision(
  tenantId: string,
  orderId: string,
  revision: number,
  movement: { deplete: readonly PosStockItem[]; restore: readonly PosStockItem[] },
): Promise<void> {
  if (movement.deplete.length === 0 && movement.restore.length === 0) return;

  await postStockAction({
    tenantId,
    orderId,
    action: "revise",
    revision,
    deplete: movement.deplete,
    restore: movement.restore,
  });
}

/** The one authenticated call both directions share. Never throws. */
async function postStockAction(body: Record<string, unknown>): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch(`${getWebAppUrl()}/api/inventory/order-stock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort — the order already succeeded. The ledger is reconcilable by
    // stocktake; a failed sale or a stuck cancellation is not.
  }
}
