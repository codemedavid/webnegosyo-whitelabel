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
 * How long the counter waits for a code before deciding it cannot be verified.
 *
 * Short, because a cashier is standing in front of a customer while this runs
 * and the fallback — "that code could not be applied" — is a fine answer. It is
 * deliberately far below the 20s the stock write allows itself: that one may
 * have landed on the server and must not be re-sent lightly, whereas a lookup
 * reads and can simply be retried.
 */
const LOOKUP_TIMEOUT_MS = 8_000;

export interface LookupOptions {
  timeoutMs?: number;
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
  options: LookupOptions = {},
): Promise<Voucher[]> {
  if (codes.length === 0) return [];

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Aborted AND raced, for the reason `inventory-movement-service` documents:
  // the abort releases the socket, but React Native's fetch has not always
  // propagated an abort as a rejection, and relying on it alone is how a
  // spinner outlives the timeout meant to end it. The race is what guarantees
  // this function returns.
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, options.timeoutMs ?? LOOKUP_TIMEOUT_MS);
  });

  try {
    // The session read is inside the deadline, not before it. A client midway
    // through a token refresh with no signal hangs here rather than in fetch,
    // and a deadline that only starts afterwards would never fire.
    const token = await Promise.race([accessToken(), expiry]);
    if (!token) return [];

    const response = await Promise.race([
      fetch(`${getWebAppUrl()}/api/vouchers/lookup`, {
        signal: controller.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenantId, codes }),
      }),
      expiry,
    ]);

    if (!response.ok) return [];

    const body = await Promise.race([response.json(), expiry]);
    return Array.isArray(body?.vouchers) ? (body.vouchers as Voucher[]) : [];
  } catch {
    // A timeout lands here with every other failure, and belongs there: an
    // unverifiable code is worth zero either way, which is the safe direction.
    return [];
  } finally {
    clearTimeout(timer);
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
