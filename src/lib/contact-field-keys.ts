/**
 * Which `customer_data` key holds the customer's phone or email.
 *
 * Merchants name their own checkout fields, so the number a customer typed can
 * land under anything — `customer_phone`, `Contact Number`, `Phone number`,
 * `Mobile Number`, `phone_number`. Identity resolution used to recognize four
 * hard-coded keys, which meant that for every store outside that naming the
 * order was stored with a blank contact and the tracking page kept asking a
 * customer who had already given their number to add one.
 *
 * Two rules, in order:
 *   1. the well-known keys, which are what the platform's own forms write, and
 *   2. a key whose NAME reads like a contact field, for merchant-named ones.
 *
 * Rule 2 is deliberately name-shaped rather than a scan of every value: a
 * "Special Instructions" note that happens to contain digits is not a contact,
 * and a table number is not a contact even when a customer types their phone
 * into it — promising a loyalty stamp on a field the merchant never meant as a
 * phone is worse than asking for the number.
 *
 * Pure and side-effect free. `convex-template/convex/customerIdentity.ts` keeps
 * a parity-tested mirror; keep the two in sync.
 */

/** The keys the platform's own checkout forms write. Checked first. */
export const WELL_KNOWN_PHONE_KEYS = ['customer_phone', 'phone', 'mobile', 'contact_number'] as const
export const WELL_KNOWN_EMAIL_KEYS = ['customer_email', 'email'] as const

/** A field name a merchant would only give to a phone input. */
const PHONE_NAME_SHAPE = /(phone|mobile|cell|contact|viber|whats\s*app)/i

/** A field name a merchant would only give to an email input. */
const EMAIL_NAME_SHAPE = /e-?mail/i

/**
 * Names that carry digits but never a contact. `table_number` is the reserved
 * table field (see `order-table-number.ts`); the loose shape catches the
 * merchants who spelled it "Table Number" or "table  number" themselves.
 */
const NEVER_A_CONTACT_SHAPE = /table/i

function isNeverAContact(key: string): boolean {
  return NEVER_A_CONTACT_SHAPE.test(key)
}

/** Field names that read like a phone input, in the order they should be tried. */
export function phoneFieldKeys(keys: readonly string[]): string[] {
  return orderedCandidates(keys, WELL_KNOWN_PHONE_KEYS, PHONE_NAME_SHAPE)
}

/** Field names that read like an email input, in the order they should be tried. */
export function emailFieldKeys(keys: readonly string[]): string[] {
  return orderedCandidates(keys, WELL_KNOWN_EMAIL_KEYS, EMAIL_NAME_SHAPE)
}

/**
 * The well-known keys first (a form carrying both must key on the canonical
 * one), then every merchant-named key that reads like the same field.
 */
function orderedCandidates(
  keys: readonly string[],
  wellKnown: readonly string[],
  shape: RegExp
): string[] {
  const present = new Set(keys)
  const ordered = wellKnown.filter(key => present.has(key))
  const seen = new Set(ordered)

  for (const key of keys) {
    if (seen.has(key) || isNeverAContact(key)) continue
    if (shape.test(key)) {
      ordered.push(key)
      seen.add(key)
    }
  }

  return ordered
}
