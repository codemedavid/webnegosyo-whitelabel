/**
 * Booking, syncing and cancelling a Lalamove delivery from the merchant app.
 *
 * The four Lalamove operations shipped only as Convex actions. Tenants on the
 * shared platform Supabase have no Convex deployment, so the delivery card's
 * buttons reached nothing at all — which is most of the Lalamove traffic on the
 * platform, not an edge case.
 *
 * This module is the transport seam. On Convex the card keeps calling the
 * deployment's own actions; on the platform it posts to the web app's Lalamove
 * route with the merchant's own access token, exactly as the register already
 * does to burn a voucher or deplete stock. The split is not stylistic: the
 * tenant's Lalamove API key and secret sign every request, and they must stay
 * on a server rather than ship to a phone.
 */

import { supabase } from "./supabase";
import { getWebAppUrl } from "./web-app-url";
import type { OrderSessionFields } from "./order-backend";

/** The four things a merchant can do to a delivery from the order screen. */
export type LalamoveOp = "book" | "sync" | "cancel" | "priority_fee";

export type LalamoveTransport = "convex" | "platform" | "unavailable";

export interface LalamoveOpInput {
  op: LalamoveOp;
  tenantId: string;
  orderId: string;
  /** Priority-fee tip, as a decimal string — Lalamove takes it that way. */
  amount?: string;
}

export interface LalamoveOpResult {
  success: boolean;
  error?: string;
}

/**
 * How long the app waits before deciding a booking did not go through.
 *
 * Generous, because the server round trip includes two Lalamove API calls
 * (retrieve the quotation, then place the order) and a merchant would rather
 * wait than re-book. See the timeout copy below for why re-trying is the
 * dangerous advice here.
 */
const DEFAULT_TIMEOUT_MS = 25000;

const TIMEOUT_MESSAGE =
  "The request took too long. The delivery may have been booked — check before booking again.";

/**
 * Which backend can serve this session's Lalamove operations.
 *
 * Mirrors `hasLiveOrderBackend`: `supabase` is a separate per-tenant project
 * the app ships no adapter for, and claiming a transport for it would send a
 * booking to the wrong database. A session whose `orderBackend` has not
 * resolved yet falls back to the historical rule — a deployment url means
 * Convex — so the card keeps working during the first render after login.
 */
export function resolveLalamoveTransport(session: OrderSessionFields): LalamoveTransport {
  if (session.orderBackend === "platform") return "platform";
  if (session.orderBackend === "supabase") return "unavailable";
  return session.convexUrl && session.convexUrl.trim() !== "" ? "convex" : "unavailable";
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Run one Lalamove operation against the web app's route.
 *
 * Never throws — the card renders the result in an alert either way, and a
 * thrown error would leave the button stuck busy. It does, however, always
 * report failure faithfully: a merchant told a rider was booked when none was
 * has a customer waiting on an order that will never move.
 */
export async function runPlatformLalamoveOp(
  input: LalamoveOpInput,
  options: { timeoutMs?: number } = {},
): Promise<LalamoveOpResult> {
  const token = await accessToken();
  if (!token) {
    return { success: false, error: "You are signed out. Sign in and try again." };
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Aborted AND raced, matching `submitStockMovement`. The abort releases the
  // socket; the race is what guarantees this returns, because React Native's
  // fetch has not always surfaced an abort as a rejection — and relying on the
  // abort alone is how a Book button outlives the timeout meant to free it.
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("timeout"));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });

  let response: Response;
  try {
    response = await Promise.race([
      fetch(`${getWebAppUrl()}/api/lalamove`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          op: input.op,
          tenantId: input.tenantId,
          orderId: input.orderId,
          ...(input.amount === undefined ? {} : { amount: input.amount }),
        }),
      }),
      expiry,
    ]);
  } catch (error) {
    if (timedOut) return { success: false, error: TIMEOUT_MESSAGE };
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reach the delivery service",
    };
  } finally {
    clearTimeout(timer);
  }

  const body = (await response.json().catch(() => null)) as LalamoveOpResult | null;

  if (!response.ok) {
    return { success: false, error: body?.error ?? `Request failed (${response.status})` };
  }

  return { success: body?.success === true, error: body?.error };
}
