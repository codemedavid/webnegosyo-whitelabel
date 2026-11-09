/**
 * Fixing a placed order's delivery from the app: address, pin, rider notes and
 * a link the customer can set their own pin with.
 *
 * Both calls go to the web app with the merchant's own token, like Lalamove:
 * the pin link is signed with a secret only the server holds, and both apply
 * the same rules as the web admin. Platform stores only (`canFixDelivery`).
 * Never throws: the sheet shows the result either way.
 */

import { supabase } from "./supabase";
import { getWebAppUrl } from "./web-app-url";
import type { LatLng } from "./pos-checkout-fields";

const TIMEOUT_MS = 15_000;
const OFFLINE_MESSAGE = "Could not reach the server. Check your connection and try again.";

export interface DeliveryDetailsPatch {
  address?: string;
  pin?: LatLng;
  unit?: string;
  landmark?: string;
  riderNote?: string;
  storeNote?: string;
}

export type DeliveryDetailsResult = { ok: true } | { ok: false; error: string };
export type PinLinkResult = { ok: true; url: string } | { ok: false; error: string };

interface PostOutcome {
  ok: boolean;
  body: { error?: string; url?: string } | null;
  error?: string;
}

async function postToWeb(path: string, payload: Record<string, unknown>): Promise<PostOutcome> {
  let token: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  } catch (error) {
    console.warn("[delivery-details] could not read the session:", error);
  }
  if (!token) return { ok: false, body: null, error: "You are signed out. Sign in and try again." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${getWebAppUrl()}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as PostOutcome["body"];
    return response.ok
      ? { ok: true, body }
      : { ok: false, body, error: body?.error ?? `Request failed (${response.status})` };
  } catch (error) {
    console.warn("[delivery-details] request failed:", error);
    return { ok: false, body: null, error: OFFLINE_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
}

export async function saveDeliveryDetails(tenantId: string, orderId: string, patch: DeliveryDetailsPatch): Promise<DeliveryDetailsResult> {
  const outcome = await postToWeb("/api/orders/delivery-details", { tenantId, orderId, patch });
  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error ?? OFFLINE_MESSAGE };
}

export async function requestPinLink(tenantId: string, orderId: string): Promise<PinLinkResult> {
  const outcome = await postToWeb("/api/orders/pin-link", { tenantId, orderId });
  if (!outcome.ok) return { ok: false, error: outcome.error ?? OFFLINE_MESSAGE };
  return outcome.body?.url ? { ok: true, url: outcome.body.url } : { ok: false, error: OFFLINE_MESSAGE };
}
