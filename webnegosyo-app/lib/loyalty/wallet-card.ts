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
  createAttachableCustomer,
  findAttachableByPhone,
} from "../customers/attach-lookup";
import { DuplicateCustomerError } from "../customers/repo";
import type { AttachedCustomer } from "../customers/pos-attachment";

const MEMBER_CODE = /^WNLC1\.[A-Za-z0-9_-]{24}$/;
const E164 = /^\+[0-9]{8,15}$/;
const IDENTIFY_TIMEOUT_MS = 10_000;
/** Postgres insufficient_privilege — the register functions refused this session. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";
/** What the register functions raise for a session without `pos` on this store. */
const NOT_ALLOWED = /not allowed/i;

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

/**
 * The register's exact lookup + quick-create (lib/customers/attach-lookup.ts),
 * never the guest list: a cashier scanning a card holds `pos`, not necessarily
 * the `customers` grant that reading the table requires.
 */
interface CustomerRepo {
  findByPhone: typeof findAttachableByPhone;
  create: typeof createAttachableCustomer;
}

const LIVE_REPO: CustomerRepo = {
  findByPhone: findAttachableByPhone,
  create: createAttachableCustomer,
};

/** The guest with this exact number, saved first if the counter has never met them. */
export async function resolveScannedCustomer(
  tenantId: string,
  phoneE164: string,
  repo: CustomerRepo = LIVE_REPO,
): Promise<AttachedCustomer> {
  const existing = await repo.findByPhone(tenantId, phoneE164);
  if (existing) return existing;

  try {
    return await repo.create(tenantId, { name: null, phoneE164, email: null, notes: null });
  } catch (error) {
    // A duplicate means the guest exists — saved by another register between
    // our lookup and our save. Find them again; fail only if they stay hidden.
    if (!(error instanceof DuplicateCustomerError)) throw error;
    const saved = await repo.findByPhone(tenantId, phoneE164);
    if (saved) return saved;
    throw error;
  }
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isPermissionRefusal(error: unknown): boolean {
  if (errorCode(error) === PG_INSUFFICIENT_PRIVILEGE) return true;
  return error instanceof Error && NOT_ALLOWED.test(error.message);
}

/** The loggable cause of an attach failure — a logged Error alone drops its `code`. */
export function attachFailureDetail(error: unknown): { code: string | null; message: string } {
  return {
    code: errorCode(error),
    message: error instanceof Error ? error.message : String(error),
  };
}

/** What the cashier sees when a recognised card could not be attached to the sale. */
export function describeAttachFailure(error: unknown): string {
  return isPermissionRefusal(error)
    ? "You don't have permission to attach guests at this register."
    : "Card recognised, but the guest could not be attached. Search their number instead.";
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
