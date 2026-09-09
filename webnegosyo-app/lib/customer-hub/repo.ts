/**
 * Fetching the Customer Hub overview from the platform.
 *
 * Unlike its siblings in `lib/customers/`, this one SURFACES failure. Capture
 * and lifecycle sync are bookkeeping that must never block a sale, so they
 * swallow everything; this is the screen's entire content, and a silent failure
 * would draw an empty Hub that reads as "this store has no repeat customers" —
 * a confident, wrong answer where there was none.
 *
 * Aborted AND raced for the reason `voucher-service.ts` documents: React
 * Native's fetch has not always propagated an abort as a rejection, and relying
 * on it alone is how a spinner outlives the timeout meant to end it.
 */

import { supabase } from "../supabase";
import { getWebAppUrl } from "../web-app-url";
import type { HubOverview } from "./overview";

const OVERVIEW_PATH = "/api/customers/hub-overview";
/** One read must span the widest window the Hub draws. */
const OVERVIEW_DAYS = 90;
/**
 * Longer than a voucher lookup, which runs with a customer waiting at the
 * counter; this is a dashboard the merchant chose to open.
 */
const OVERVIEW_TIMEOUT_MS = 15_000;

export type HubOverviewResult =
  | { ok: true; overview: HubOverview }
  | { ok: false; reason: "disabled" | "forbidden" | "unavailable" };

export async function fetchHubOverview(input: {
  tenantId: string;
  outletId?: string | null;
}): Promise<HubOverviewResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, OVERVIEW_TIMEOUT_MS);
  });

  try {
    // Inside the deadline, not before it: a client midway through a token
    // refresh hangs here, and a deadline starting afterwards would never fire.
    const { data } = await Promise.race([supabase.auth.getSession(), expiry]);
    const token = data.session?.access_token;
    if (!token) return { ok: false, reason: "forbidden" };

    const response = await Promise.race([
      fetch(`${getWebAppUrl()}${OVERVIEW_PATH}`, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenantId: input.tenantId,
          outletId: input.outletId ?? null,
          days: OVERVIEW_DAYS,
        }),
      }),
      expiry,
    ]);

    if (!response.ok) {
      if (response.status !== 403) return { ok: false, reason: "unavailable" };

      // 403 covers two different situations that read very differently to the
      // person holding the phone: the store is not in the pilot, or this staff
      // member may not see customers. The body distinguishes them.
      const body = await Promise.race([response.json().catch(() => null), expiry]);
      const message = typeof body?.error === "string" ? body.error.toLowerCase() : "";
      return { ok: false, reason: message.includes("not enabled") ? "disabled" : "forbidden" };
    }

    const body = await Promise.race([response.json(), expiry]);
    const overview = body?.overview as HubOverview | undefined;
    if (!overview || !Array.isArray(overview.windows)) {
      return { ok: false, reason: "unavailable" };
    }

    return { ok: true, overview };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
