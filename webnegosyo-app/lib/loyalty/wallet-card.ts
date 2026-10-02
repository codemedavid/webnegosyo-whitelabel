/**
 * Scanning a customer's Apple/Google Wallet loyalty card at the register.
 *
 * The card's QR holds a random member serial, never a phone number. The
 * server resolves it (only for cards THIS store issued) to the phone the card
 * belongs to; the register then attaches that guest exactly as if the cashier
 * had searched the number — so the sale earns through the normal phone-linked
 * path and nothing about earning changes.
 */

import { getWebAppUrl } from "../web-app-url";
import { getAccessTokenBounded } from "../authorized-post";
import {
  createCustomer,
  listCustomers,
  type CustomerRecord,
} from "../customers/repo";
import type { AttachedCustomer } from "../customers/pos-attachment";

const MEMBER_CODE = /^WNLC1\.[A-Za-z0-9_-]{24}$/;
const E164 = /^\+[0-9]{8,15}$/;
const IDENTIFY_TIMEOUT_MS = 10_000;

export type ScanFailure = "not_a_card" | "not_found" | "forbidden" | "signed_out" | "unavailable";
export type IdentifyResult = { ok: true; phoneE164: string } | { ok: false; reason: ScanFailure };

interface FetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export interface WalletCardDeps {
  getAccessToken: () => Promise<string | null>;
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<FetchResponse>;
}

const defaultDeps: WalletCardDeps = {
  getAccessToken: () => getAccessTokenBounded(IDENTIFY_TIMEOUT_MS),
  fetch: (url, init) => fetch(url, init) as unknown as Promise<FetchResponse>,
};

export function isMemberCardCode(raw: string): boolean {
  return MEMBER_CODE.test(raw.trim());
}

function failureForStatus(status: number): ScanFailure {
  if (status === 404) return "not_found";
  if (status === 403) return "forbidden";
  if (status === 401) return "signed_out";
  if (status === 422) return "not_a_card";
  return "unavailable";
}

export async function identifyWalletCard(
  tenantId: string,
  rawCode: string,
  deps: WalletCardDeps = defaultDeps,
): Promise<IdentifyResult> {
  const code = rawCode.trim();
  if (!isMemberCardCode(code)) return { ok: false, reason: "not_a_card" };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, IDENTIFY_TIMEOUT_MS);
  });

  try {
    const token = await Promise.race([deps.getAccessToken(), expiry]);
    if (!token) return { ok: false, reason: "signed_out" };

    const response = await Promise.race([
      deps.fetch(`${getWebAppUrl()}/api/loyalty/passes/identify`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId, code }),
      }),
      expiry,
    ]);
    if (!response.ok) return { ok: false, reason: failureForStatus(response.status) };

    const body = (await Promise.race([response.json(), expiry])) as { phoneE164?: unknown } | null;
    const phone = body?.phoneE164;
    return typeof phone === "string" && E164.test(phone)
      ? { ok: true, phoneE164: phone }
      : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

interface CustomerRepo {
  listCustomers: typeof listCustomers;
  createCustomer: typeof createCustomer;
}

function toAttached(record: CustomerRecord): AttachedCustomer {
  return { id: record.id, name: record.name, phoneE164: record.phoneE164, email: record.email };
}

/** The guest with this exact number, saved first if the counter has never met them. */
export async function resolveScannedCustomer(
  tenantId: string,
  phoneE164: string,
  repo: CustomerRepo = { listCustomers, createCustomer },
): Promise<AttachedCustomer> {
  const matches = await repo.listCustomers(tenantId, { search: phoneE164, limit: 10 });
  const existing = matches.find((record) => record.phoneE164 === phoneE164);
  if (existing) return toAttached(existing);

  const created = await repo.createCustomer(tenantId, { name: null, phoneE164, email: null, notes: null });
  return toAttached(created);
}

export function describeScanFailure(reason: ScanFailure): string {
  switch (reason) {
    case "not_a_card":
      return "That QR is not a loyalty card. Ask the guest to open their store card in Wallet.";
    case "not_found":
      return "Card not recognised — it may belong to another store.";
    case "forbidden":
      return "You need register (POS) permission to scan loyalty cards.";
    case "signed_out":
      return "Your session expired. Sign in again to scan cards.";
    case "unavailable":
      return "Could not check the card. Check your connection and try again.";
  }
}
