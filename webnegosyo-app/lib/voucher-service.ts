import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { OrderDiscountLine } from "./order-totals";
import type { Voucher } from "./vouchers/types";

/**
 * The register's two server-mediated voucher calls.
 *
 * The register PRICES vouchers locally — the shared engine in `lib/vouchers/`
 * is a byte-identical copy of the web one, so a code is worth the same at the
 * counter as it is online, and it stays worth that on a flaky connection.
 *
 * Two things it still cannot do alone:
 *
 *  - READ the merchant's vouchers. They are rows in the platform database, not
 *    on the phone.
 *  - BURN a redemption. `redeem_voucher()` is SECURITY DEFINER and executable
 *    by `service_role` only — deliberately, after a security review found
 *    PostgREST had published it to anon. The phone holds an anon key.
 *
 * Both therefore go through the web app, authenticated with the cashier's own
 * session token, exactly as `pos-stock-notify.ts` already does for stock.
 */

function getWebAppUrl(): string {
  return Constants.expoConfig?.extra?.webAppUrl ?? "https://webnegosyo.com";
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Fetches the vouchers behind the codes a cashier typed.
 *
 * Returns an empty list on any failure — an unverifiable code is worth zero,
 * never assumed valid. This is the one part of register discounting that
 * genuinely needs the network: local pricing keeps working offline, but only
 * for a voucher already fetched. A code typed with no signal simply does not
 * apply, which is the safe direction to fail.
 */
export async function lookupVouchers(
  tenantId: string,
  codes: readonly string[],
): Promise<Voucher[]> {
  if (codes.length === 0) return [];

  try {
    const token = await accessToken();
    if (!token) return [];

    const response = await fetch(`${getWebAppUrl()}/api/vouchers/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tenantId, codes }),
    });

    if (!response.ok) return [];

    const body = await response.json();
    return Array.isArray(body?.vouchers) ? (body.vouchers as Voucher[]) : [];
  } catch {
    return [];
  }
}

/**
 * Fire-and-forget: burn the redemptions a completed sale used.
 *
 * Never throws. By the time this runs the sale is rung up, tendered and saved;
 * a burn must not be able to fail the tender screen or make a paid order look
 * unsuccessful. A drifting usage count is the lesser harm, and it is bounded —
 * `redeem_voucher()` is keyed on `(voucher_id, order_id)`, so a retry is a
 * no-op rather than a second burn.
 *
 * Manual discounts are skipped: a cashier-entered discount has no voucher
 * behind it, so there is no usage count to move.
 */
export async function burnPosRedemptions(
  tenantId: string,
  orderId: string,
  discountLines: readonly OrderDiscountLine[],
  outletId?: string | null,
): Promise<void> {
  const redemptions = discountLines
    .filter((line) => typeof line.voucherId === "string" && line.voucherId !== "")
    .map((line) => ({ voucherId: line.voucherId as string, amount: line.amount }));

  if (redemptions.length === 0) return;

  try {
    const token = await accessToken();
    if (!token) return;

    await fetch(`${getWebAppUrl()}/api/vouchers/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tenantId,
        orderId,
        channel: "pos",
        outletId: outletId ?? null,
        redemptions,
      }),
    });
  } catch {
    // Best-effort — the customer has already paid. See the note above.
  }
}
