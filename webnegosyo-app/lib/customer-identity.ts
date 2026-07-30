/**
 * Who the guest behind an order is — the merchant app's side.
 *
 * Hand-kept copy of the identity half of `src/lib/customer-identity.ts` (the
 * stored-profile aggregate stays on the web, which owns the writes). **Keep the
 * two in sync.**
 *
 * This exists so the app can answer one question honestly: *is this a returning
 * guest?* Two failure modes it is written to avoid, both of which produced real
 * bugs on the web side:
 *
 * - **Inventing a guest.** Counter staff type "POS", "walk-in", "N/A" into the
 *   name field. Treated as contacts, every walk-in in the store collapses into
 *   one immortal regular and repeat rate reads near 100%.
 * - **Losing a guest.** Tenants name their phone input `phone`, `mobile` or
 *   `contact_number` as they like, and customers type `0917…`, `+63917…` or
 *   `0917 123 4567`. Any variant read literally splits one guest into several
 *   and repeat rate collapses toward 0%.
 *
 * Nothing here throws. Orders arrive untyped from three backends, so every read
 * is structural and a malformed row resolves to "unidentified" rather than
 * breaking the screen.
 */

import { normalizePhoneE164 } from "./phone";

/** Contacts that identify nobody — anonymous POS / walk-in orders. */
const PLACEHOLDER_CONTACTS = new Set([
  "pos",
  "walk-in",
  "walkin",
  "walk in",
  "n/a",
  "na",
  "none",
  "unknown",
  "guest",
  "-",
  "--",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field names tenants have used for the same phone input. */
const PHONE_KEYS = ["customer_phone", "phone", "mobile", "contact_number"] as const;
const EMAIL_KEYS = ["customer_email", "email"] as const;
const NAME_KEYS = ["customer_name", "name"] as const;

export interface CustomerIdentityInput {
  name?: string | null;
  contact?: string | null;
  customerData?: unknown;
}

export interface CustomerIdentity {
  phoneE164: string | null;
  email: string | null;
  name: string | null;
  /**
   * Stable dedupe key, e.g. `phone:+639171234567`; null when the order cannot
   * be attributed to a person at all.
   */
  identityKey: string | null;
}

/**
 * An order as any of the three backends hands it over. Convex uses
 * `customerData`; the platform-Supabase column is `customer_data`, and rows can
 * reach a screen before the adapter has renamed it.
 */
export interface IdentifiableOrderLike {
  name?: string | null;
  contact?: string | null;
  customerData?: unknown;
  customer_data?: unknown;
}

/** True when the contact string can identify a real, reachable person. */
export function isIdentifiableContact(contact: string | null | undefined): boolean {
  if (!contact) return false;
  const key = contact.trim().toLowerCase();
  if (!key) return false;
  return !PLACEHOLDER_CONTACTS.has(key);
}

/** A plain object, or null for anything else a backend might have put there. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(data: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (!data) return null;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

/**
 * Resolve the identity of the guest behind an order.
 *
 * Phone (normalized E.164) is the primary key and email the fallback, in that
 * order deliberately: a guest who gives both must not become two guests, and
 * the phone is the field a PH restaurant actually collects.
 */
export function resolveCustomerIdentity(input: CustomerIdentityInput): CustomerIdentity {
  const blob = asRecord(input.customerData);

  const name =
    pickString(blob, NAME_KEYS) ??
    (input.name && input.name.trim() !== "" ? input.name.trim() : null);

  // The flat `contact` field is untyped: it may hold a phone or an email, so it
  // is offered to both normalizers and whichever recognises it wins.
  const looseContact = isIdentifiableContact(input.contact) ? input.contact ?? null : null;

  const phoneE164 = normalizePhoneE164(pickString(blob, PHONE_KEYS) ?? looseContact);
  const email = normalizeEmail(pickString(blob, EMAIL_KEYS) ?? looseContact);

  const identityKey = phoneE164 ? `phone:${phoneE164}` : email ? `email:${email}` : null;

  return { phoneE164, email, name, identityKey };
}

/**
 * The identity key for an order row, or null when it belongs to nobody.
 *
 * The convenience the analytics path actually wants: it reads whichever blob
 * key the backend used, so callers never have to know which one they have.
 */
export function resolveOrderIdentityKey(
  order: IdentifiableOrderLike | null | undefined,
): string | null {
  if (!order) return null;

  return resolveCustomerIdentity({
    name: order.name,
    contact: order.contact,
    customerData: asRecord(order.customerData) ?? asRecord(order.customer_data),
  }).identityKey;
}
