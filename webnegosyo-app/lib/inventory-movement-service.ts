/**
 * Sending a hand-recorded stock movement to the platform.
 *
 * This deliberately breaks the pattern of lib/pos-stock-notify.ts, which never
 * throws. That one runs behind a sale already rung up and paid for, where
 * silence is kinder than a register that will not close a tender.
 *
 * Here the merchant is watching. They typed a delivery and are waiting to be
 * told it landed. Swallowing a failure would show a confirmation for a write
 * that never happened, and they would discover it at the next stocktake with no
 * way to tell which movement went missing. So every failure surfaces.
 *
 * The write itself goes through the platform rather than straight to Supabase.
 * RLS would permit a direct insert, but three things live on the server side of
 * that call and cannot follow the client: the signed delta is resolved against
 * the quantity read in the same request, a delivery's price is blended into the
 * moving average, and crossing the reorder line raises alerts and can 86 a
 * dish. A direct insert would skip all three and get the first one wrong.
 */

import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { MovementPayload } from "./inventory-movement";

function getWebAppUrl(): string {
  return Constants.expoConfig?.extra?.webAppUrl ?? "https://webnegosyo.com";
}

export interface MovementResult {
  /** The on-hand quantity as the ledger settled it, in stock units. */
  currentQty: number;
}

/**
 * Record one movement. Resolves with the server's figure, throws with a
 * message worth showing the merchant.
 */
export async function submitStockMovement(
  tenantId: string,
  payload: MovementPayload,
  outletId?: string | null,
): Promise<MovementResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Checked before the request so an expired session reads as "sign in again"
  // rather than as a rejection of what they typed.
  if (!token) throw new Error("Your session has expired. Sign in and try again.");

  let response: Response;
  try {
    response = await fetch(`${getWebAppUrl()}/api/inventory/movement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      // The branch is sent, not assumed. The server vets it — a manager naming
      // another shop is refused — but it has to be told which shelf the
      // merchant was looking at, or a delivery recorded against South's empty
      // shelf lands in the unbranched pool and South still reads zero.
      // Omitted rather than sent as null when there is no branch, so a
      // single-shop tenant's request is byte-for-byte what it was before.
      body: JSON.stringify(outletId ? { tenantId, ...payload, outletId } : { tenantId, ...payload }),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error ?? "That did not save. Try again.");
  }

  // The screen shows what the ledger settled on, never the phone's arithmetic,
  // so an adjusted or partially-applied write cannot leave a confident wrong
  // number in front of the merchant.
  return { currentQty: Number(body?.item?.current_qty ?? 0) };
}
