// Who counts as an identifiable customer in analytics.
//
// POS walk-in orders carry a placeholder contact ("POS", "walk-in", blank…).
// Grouping by contact collapsed all of them into one fake "customer", which
// inflated totalCustomers and skewed spend-per-customer. Customer metrics
// must only count orders whose contact can actually identify a person;
// anonymous orders are reported separately as walk-ins.

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

/** Normalized grouping key so the same person's orders join up. */
export function customerKey(contact: string): string {
  return contact.toLowerCase().trim();
}

/** True when the contact can identify a real, reachable customer. */
export function isIdentifiableCustomer(contact: string | undefined): boolean {
  if (!contact) return false;
  const key = customerKey(contact);
  if (!key) return false;
  return !PLACEHOLDER_CONTACTS.has(key);
}

// Tenant checkout forms name the phone/email fields differently, so an order's
// real identity may live in customerData under any of these keys. Mirrors the
// web app's resolveCustomerIdentity (src/lib/customer-identity.ts).
const PHONE_KEYS = ["customer_phone", "phone", "mobile", "contact_number", "contact"];
const EMAIL_KEYS = ["customer_email", "email"];
const PH_E164 = /^\+63\d{10}$/;

/**
 * Normalize a PH phone to E.164 (`+639XXXXXXXXX`), mirroring web `src/lib/phone.ts`
 * so the same person's orders join into one customer regardless of the format
 * stored (raw `09...`, `9...`, `63...`, or already-E.164). Returns "" if the
 * value can't be confidently read as a PH number.
 */
function normalizePhoneE164(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  let digits = trimmed.replace(/\D+/g, "");
  if (!trimmed.startsWith("+") && digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return "";
  let candidate: string;
  if (digits.startsWith("63")) candidate = `+${digits}`;
  else if (digits.startsWith("0")) candidate = `+63${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith("9")) candidate = `+63${digits}`;
  else candidate = `+63${digits}`;
  return PH_E164.test(candidate) ? candidate : "";
}

/** First non-empty string value among the given keys of an untyped data bag. */
function pickField(data: unknown, keys: string[]): string {
  if (!data || typeof data !== "object") return "";
  const bag = data as Record<string, unknown>;
  for (const key of keys) {
    const value = bag[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * The canonical grouping key for one order in customer analytics.
 *
 * Resolves the strongest available identifier — normalized PH phone first, then
 * a lowercased email — from the stored `customerContact` OR the order's
 * `customerData` (whatever field the tenant form used). This makes legacy orders
 * (blank/placeholder contact) and cross-channel orders (raw vs E.164 phone) group
 * under one real person. Returns "" for genuinely anonymous orders so they are
 * tallied as walk-ins instead of collapsing into a single phantom customer.
 */
export function resolveAnalyticsContact(
  contact: string | undefined,
  customerData: unknown
): string {
  // 1. Phone carried directly on customerContact (post-fix web/mobile orders).
  const contactPhone = normalizePhoneE164(contact ?? "");
  if (contactPhone) return contactPhone;

  // 2. Phone recovered from customerData (legacy orders / non-standard fields).
  const dataPhone = normalizePhoneE164(pickField(customerData, PHONE_KEYS));
  if (dataPhone) return dataPhone;

  // 3. An identifiable, non-phone contact (e.g. an email stored as the contact).
  if (isIdentifiableCustomer(contact)) return customerKey(contact as string);

  // 4. Email recovered from customerData.
  const dataEmail = pickField(customerData, EMAIL_KEYS).toLowerCase();
  if (dataEmail.includes("@")) return dataEmail;

  // 5. Genuinely anonymous — walk-in.
  return "";
}
