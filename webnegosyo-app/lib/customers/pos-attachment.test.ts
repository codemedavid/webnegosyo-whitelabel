/**
 * Attaching a known guest to a counter sale.
 *
 * The register has always had a free-text name box, which credits nobody: a
 * name is not an identity, and "Maria" typed twice is two strangers. Attaching
 * a customer instead means writing their *contact* onto the order, because that
 * is what the capture path resolves against — the same resolver a web checkout
 * uses. Get this wrong and the sale either credits no one or, worse, credits
 * the wrong regular.
 *
 * Deliberately NOT here: the customer's id. The register never asserts which
 * customer a sale belongs to; it states how to reach them and the server
 * decides who that is. One source of truth, and a till cannot mislink a sale.
 */

import {
  posCustomerFields,
  attachmentSummary,
  clearedSaleCustomer,
  type AttachedCustomer,
} from "./pos-attachment";

const MARIA: AttachedCustomer = {
  id: "c1",
  name: "Maria Santos",
  phoneE164: "+639171234567",
  email: null,
};

describe("posCustomerFields — what gets written onto the sale", () => {
  it("writes the attached guest's phone as the order's contact", () => {
    // This single field is what makes the sale land on their profile. Without
    // it the order is anonymous however clearly the cashier picked them.
    const fields = posCustomerFields(MARIA, "");

    expect(fields.customerContact).toBe("+639171234567");
  });

  it("uses the attached guest's name over anything typed in the box", () => {
    // Picking a guest is a stronger statement than typing a name, and leaving
    // the typed text would print a receipt for a different person.
    const fields = posCustomerFields(MARIA, "walk in guy");

    expect(fields.customerName).toBe("Maria Santos");
  });

  it("falls back to the email when the guest has no phone", () => {
    const fields = posCustomerFields(
      { id: "c2", name: "Ana", phoneE164: null, email: "ana@example.com" },
      "",
    );

    expect(fields.customerContact).toBe("ana@example.com");
  });

  it("prefers the phone when the guest has both", () => {
    // Mirrors the shared resolver's priority. Disagreeing with it would split
    // one guest into two profiles depending on which till rang the sale.
    const fields = posCustomerFields(
      { ...MARIA, email: "maria@example.com" },
      "",
    );

    expect(fields.customerContact).toBe("+639171234567");
  });

  it("keeps the typed name when the attached guest has none", () => {
    const fields = posCustomerFields({ ...MARIA, name: null }, "Table 4");

    expect(fields.customerName).toBe("Table 4");
  });

  it("trims the typed name", () => {
    expect(posCustomerFields(null, "  Maria  ").customerName).toBe("Maria");
  });
});

describe("posCustomerFields — no guest attached", () => {
  it("leaves the contact empty so the sale stays an honest walk-in", () => {
    // Today's behaviour, unchanged. An empty contact identifies nobody, which
    // is exactly right for an anonymous counter sale.
    const fields = posCustomerFields(null, "Maria");

    expect(fields).toEqual({ customerName: "Maria", customerContact: "" });
  });

  it("writes nothing at all when nothing was typed either", () => {
    expect(posCustomerFields(null, "")).toEqual({
      customerName: "",
      customerContact: "",
    });
  });

  it("does not invent a contact for a guest with neither phone nor email", () => {
    // Validation forbids saving such a guest, so this should be unreachable.
    // If it ever happens the sale must be an anonymous walk-in rather than an
    // order carrying a contact that reaches nobody.
    const fields = posCustomerFields(
      { id: "c3", name: "Ghost", phoneE164: null, email: null },
      "",
    );

    expect(fields.customerContact).toBe("");
  });
});

describe("clearedSaleCustomer — the guest must not outlive the sale", () => {
  it("clears both the attachment and the typed name", () => {
    // The worst bug this feature can have: a guest left attached after the
    // sale ends, quietly crediting the next stranger's order to a regular.
    // The register's own store has no test harness, so the rule lives here
    // and the store spreads it into every path that finishes a sale.
    expect(clearedSaleCustomer()).toEqual({
      customerName: "",
      attachedCustomer: null,
    });
  });

  it("returns a fresh object each time", () => {
    // A shared constant spread into store state would let one sale's mutation
    // reach the next.
    expect(clearedSaleCustomer()).not.toBe(clearedSaleCustomer());
  });
});

describe("attachmentSummary — what the cashier sees they picked", () => {
  it("shows the guest's name and number together", () => {
    expect(attachmentSummary(MARIA)).toBe("Maria Santos · +639171234567");
  });

  it("shows the number alone for a guest with no name", () => {
    // A phone-only guest is common; printing "· +63…" with an empty name in
    // front reads as a rendering bug at the counter.
    expect(attachmentSummary({ ...MARIA, name: null })).toBe("+639171234567");
  });

  it("shows the name alone for a guest reachable only by email", () => {
    expect(
      attachmentSummary({ id: "c2", name: "Ana", phoneE164: null, email: "ana@example.com" }),
    ).toBe("Ana · ana@example.com");
  });

  it("says nobody is attached when nobody is", () => {
    expect(attachmentSummary(null)).toBe("Walk-in");
  });
});
