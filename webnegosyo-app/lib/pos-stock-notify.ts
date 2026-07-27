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
      body: JSON.stringify({ tenantId, orderId, items }),
    });
  } catch {
    // Best-effort — the sale already succeeded. The ledger is reconcilable by
    // stocktake; a failed tender is not recoverable.
  }
}
