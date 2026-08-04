/**
 * Validation for a manually-entered customer.
 *
 * Every customer that exists today was *derived* from an order: the web
 * checkout path resolved an identity and the service role upserted a profile.
 * A merchant typing a guest in at the counter is a new kind of write, and it is
 * the first one where a human can put anything at all into the identity fields.
 *
 * So this module enforces, before the row is ever sent, the two invariants the
 * derived path got for free:
 *
 * - **A customer must be reachable.** `customers_identity_ck` requires a phone
 *   or an email. Catching it here turns a raw Postgres constraint error into a
 *   sentence the merchant can act on.
 * - **A customer must be a person.** The derived path runs every contact
 *   through `isIdentifiableContact`, which is what stops "Walk-in" and "POS"
 *   from collapsing a whole day of anonymous sales into one immortal regular.
 *   Manual entry needs the same guard, because the name field at a counter is
 *   exactly where staff type "walk in".
 *
 * Nothing here throws — it returns a discriminated result so the screen can
 * paint per-field errors, and it reports *all* bad fields rather than the first
 * so the merchant fixes the form in one pass instead of three.
 */

import { normalizePhoneE164 } from "../phone";
import { isIdentifiableContact } from "../customer-identity";

/** The raw form state, exactly as the inputs hold it. All strings, never null. */
export interface CustomerDraft {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

/** A draft that passed validation, normalized into storable shape. */
export interface ValidatedCustomer {
  name: string | null;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
}

/** Per-field messages; `form` carries problems that belong to no single input. */
export interface CustomerFieldErrors {
  name?: string;
  phone?: string;
  email?: string;
  form?: string;
}

export type CustomerDraftValidation =
  | { ok: true; value: ValidatedCustomer }
  | { ok: false; errors: CustomerFieldErrors };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A blank draft. Exported so the screen and the tests agree on field shape. */
export function emptyCustomerDraft(): CustomerDraft {
  return { name: "", phone: "", email: "", notes: "" };
}

/** Trimmed value, or null when the field was left blank. */
function trimmedOrNull(raw: string): string | null {
  const value = raw.trim();
  return value === "" ? null : value;
}

export function validateCustomerDraft(draft: CustomerDraft): CustomerDraftValidation {
  const errors: CustomerFieldErrors = {};

  const name = trimmedOrNull(draft.name);
  // Reusing the identity layer's placeholder set rather than a second list here
  // is deliberate: one definition of "this names nobody", shared with the
  // derived-profile path, so the two can never disagree about what a guest is.
  if (name !== null && !isIdentifiableContact(name)) {
    errors.name = `"${name}" isn't a name — leave it blank for a walk-in guest.`;
  }

  const rawPhone = trimmedOrNull(draft.phone);
  const phoneE164 = rawPhone === null ? null : normalizePhoneE164(rawPhone);
  if (rawPhone !== null && phoneE164 === null) {
    errors.phone = "Enter a valid mobile number, like 0917 123 4567.";
  }

  const rawEmail = trimmedOrNull(draft.email);
  const email = rawEmail === null ? null : rawEmail.toLowerCase();
  if (email !== null && !EMAIL_RE.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  // The identity rule is checked against what the merchant *typed*, not against
  // what normalized. A mistyped phone must read as "fix the phone", never as
  // "this guest has no contact details" — those need different fixes.
  if (rawPhone === null && rawEmail === null) {
    errors.form = "Add a phone number or an email so you can reach this guest.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { name, phoneE164, email, notes: trimmedOrNull(draft.notes) },
  };
}

/**
 * Turn a POS search query into a prefilled draft for "save as a new guest".
 *
 * At the counter the number comes first and the name later, if at all — so a
 * phone-shaped query belongs in the phone field, not the name field, or the
 * validator would reject a perfectly good number and read as the app being
 * broken.
 *
 * Returns null when there is nothing worth creating: a blank query, or a
 * placeholder like "walk-in" that names nobody. Offering to save that would
 * invite the cashier to create the exact row {@link validateCustomerDraft}
 * exists to reject.
 */
export function draftFromSearch(query: string): CustomerDraft | null {
  const trimmed = query.trim();
  if (trimmed === "") return null;
  if (!isIdentifiableContact(trimmed)) return null;

  const draft = emptyCustomerDraft();

  if (normalizePhoneE164(trimmed) !== null) return { ...draft, phone: trimmed };
  if (EMAIL_RE.test(trimmed.toLowerCase())) return { ...draft, email: trimmed };
  return { ...draft, name: trimmed };
}
