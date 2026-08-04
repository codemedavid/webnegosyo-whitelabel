/**
 * Attaching a known guest to a counter sale.
 *
 * The register's name box has always been free text, which credits nobody: a
 * name is not an identity, and "Maria" typed on Tuesday and again on Friday is
 * two strangers. Attaching a customer writes their *contact* onto the order
 * instead, because the contact is what the capture path resolves against — the
 * same resolver a web checkout runs through.
 *
 * What this deliberately does not do is state the customer's id. The register
 * says how to reach the guest; the server decides who that is. Keeping it that
 * way means one source of truth for identity, so a till cannot link a sale to
 * the wrong regular, and the answer is identical whether the tenant's orders
 * live in Convex or in the platform database.
 */

/** A guest the cashier picked, as the customer list holds them. */
export interface AttachedCustomer {
  id: string;
  name: string | null;
  phoneE164: string | null;
  email: string | null;
}

/** The two order fields an attachment decides. */
export interface PosCustomerFields {
  customerName: string;
  customerContact: string;
}

/**
 * The contact to write on the order.
 *
 * Phone before email, matching `resolveCustomerIdentity`. Disagreeing with that
 * priority would split one guest into two profiles depending on which till rang
 * the sale up.
 */
function contactFor(attached: AttachedCustomer): string {
  return attached.phoneE164 ?? attached.email ?? "";
}

/**
 * Resolve the customer fields for a sale, from the attachment and whatever the
 * cashier typed in the name box.
 *
 * With no attachment this returns exactly what the register did before: the
 * typed name and no contact, which is an honest anonymous walk-in.
 */
export function posCustomerFields(
  attached: AttachedCustomer | null,
  typedName: string,
): PosCustomerFields {
  const typed = typedName.trim();

  if (!attached) {
    return { customerName: typed, customerContact: "" };
  }

  return {
    // The picked guest's name wins: choosing them from the list is a stronger
    // statement than text left in the box, and printing the typed text would
    // put a different person's name on the receipt.
    customerName: attached.name ?? typed,
    customerContact: contactFor(attached),
  };
}

/** The customer half of the register's state, as a finished sale leaves it. */
export interface ClearedSaleCustomer {
  customerName: string;
  attachedCustomer: AttachedCustomer | null;
}

/**
 * Wipe the guest from the register.
 *
 * The worst bug this feature can have is an attachment that outlives its sale:
 * the next stranger's order would be quietly credited to a regular, inflating
 * their spend and their visit count with somebody else's money. Every path that
 * finishes or abandons a sale spreads this, including leaving edit mode — which
 * previously left the typed name behind for exactly this reason.
 *
 * A function rather than a shared constant so no two sales can reach the same
 * object.
 */
export function clearedSaleCustomer(): ClearedSaleCustomer {
  return { customerName: "", attachedCustomer: null };
}

/** One line naming who the sale is for, for the cashier to confirm at a glance. */
export function attachmentSummary(attached: AttachedCustomer | null): string {
  if (!attached) return "Walk-in";

  const contact = contactFor(attached);
  // Either half may be missing — a phone-only guest is common, and rendering a
  // bare "· +63…" with nothing in front reads as a bug at the counter.
  return [attached.name, contact].filter((part) => part).join(" · ");
}
