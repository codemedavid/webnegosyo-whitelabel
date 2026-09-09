// Phone handling for a Lalamove booking — mirror of the web's
// src/lib/lalamove-phone.ts + src/lib/lalamove-recipient.ts. The deployment
// bundle cannot import from src/, so the rule lives twice; change both.
//
// Lalamove accepts only bare E.164 phones and refuses an order otherwise
// ("'' is not valid 'phone'. Phone must be in E.164 format"). A booking that
// forwards an empty customerContact verbatim therefore never goes through.

const E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Whether a checkout field, by its label, holds the customer's phone.
 * Merchants name the field themselves ("Phone", "Contact No.", "Mobile
 * Number"), so the match is on the normalized label rather than a fixed list.
 */
export function isPhoneFieldKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized.includes("phone") ||
    normalized.includes("mobile") ||
    normalized.startsWith("contact")
  );
}

export type LalamoveRecipientSource = "customer" | "store" | "none";

export interface LalamoveRecipient {
  phone: string;
  source: LalamoveRecipientSource;
}

/**
 * Normalize a phone to E.164. PH is the primary market; other markets fall
 * back to a generic "+digits" form. Returns "" when there is nothing usable.
 */
export function normalizeLalamovePhone(phone: string | undefined | null, market: string): string {
  if (!phone) return "";
  const trimmed = String(phone).trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  // Already international: keep the country code, drop the formatting a human
  // typed around it ("+63 917-123 4567", a trailing space).
  if (trimmed.startsWith("+")) return `+${digits}`;
  if ((market || "").toUpperCase() === "PH") {
    if (digits.startsWith("63")) return `+${digits}`;
    if (digits.startsWith("0")) return `+63${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith("9")) return `+63${digits}`;
    return `+63${digits}`;
  }
  return `+${digits}`;
}

/** True when the value is exactly what Lalamove accepts as a phone. */
export function isE164Phone(value: string | undefined | null): boolean {
  return typeof value === "string" && E164_RE.test(value);
}

function customerPhoneCandidates(contact: string | undefined, customerData: unknown): string[] {
  const bag =
    customerData && typeof customerData === "object"
      ? (customerData as Record<string, unknown>)
      : {};
  const fromData = Object.entries(bag)
    .filter(([key]) => isPhoneFieldKey(key))
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");
  return [contact ?? "", ...fromData];
}

/**
 * Who the rider calls at the drop-off: the customer's phone from wherever the
 * checkout form put it, else the store's own number (reported as `source:
 * "store"` so the merchant can be told), else nobody — which the booking
 * must refuse.
 */
export function resolveLalamoveRecipient(
  contact: string | undefined,
  customerData: unknown,
  market: string,
  storePhone: string,
): LalamoveRecipient {
  for (const candidate of customerPhoneCandidates(contact, customerData)) {
    if (candidate.includes("@")) continue;
    const phone = normalizeLalamovePhone(candidate, market);
    if (isE164Phone(phone)) return { phone, source: "customer" };
  }
  if (isE164Phone(storePhone)) return { phone: storePhone, source: "store" };
  return { phone: "", source: "none" };
}
