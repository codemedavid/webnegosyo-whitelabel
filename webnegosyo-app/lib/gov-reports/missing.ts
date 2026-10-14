/**
 * "Missing from sales book" on the phone: orders that gave a Senior/PWD
 * discount but never reached the sales book (an online order's record
 * failed), and "Record now". Both go through the web route
 * `/api/gov-discounts/missing`, which builds the record from the STORED order
 * and re-prices it — the app never sends an amount.
 */

import { callWebRoute, messageOf } from "../gov-ledger/approval-client";
import type { GovReportPeriod } from "./period";
import { parseMissingOrders, type MissingOrder } from "./missing-orders";

export type { MissingOrder };

export const GOV_MISSING_ROUTE = "/api/gov-discounts/missing";

export async function fetchMissingFromBook(tenantId: string, period: GovReportPeriod): Promise<MissingOrder[]> {
  const query = new URLSearchParams({ tenantId, startIso: period.startIso, endIso: period.endIso });
  const response = await callWebRoute(`${GOV_MISSING_ROUTE}?${query.toString()}`, { method: "GET" });
  if (!response) throw new Error("You're offline — the sales book check will run when you reconnect.");
  if (!response.ok) throw new Error(messageOf(response.json, "Could not check the sales book."));
  return parseMissingOrders(response.json);
}

export type RecordMissingResult = { ok: true } | { ok: false; message: string };

export async function recordMissingOrder(tenantId: string, orderId: string): Promise<RecordMissingResult> {
  const response = await callWebRoute(GOV_MISSING_ROUTE, { method: "POST", body: { tenantId, orderId } });
  if (!response) return { ok: false, message: "You're offline. Try again when you're connected." };
  if (!response.ok) return { ok: false, message: messageOf(response.json, "Could not record it. Try again.") };
  return { ok: true };
}
