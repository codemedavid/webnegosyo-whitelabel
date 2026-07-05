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
