/**
 * The Customer Details card on the order screen renders whatever extra fields
 * an order carries in `customerData`. That blob is also where the platform
 * stashes structured internals — the discount breakdown, the POS tender, the
 * advance-order schedule — so a naive `String(value)` renders "[object Object]"
 * to the merchant.
 */
import { buildCustomerDetailRows } from "./customer-details";

describe("buildCustomerDetailRows", () => {
  it("drops structured blobs that would render as [object Object]", () => {
    const rows = buildCustomerDetailRows({
      discount: { total: 27.8, lines: [{ label: "PWD", amount: 27.8 }] },
      pos: { cashTendered: 500, changeDue: 249.8 },
    });

    expect(rows).toEqual([]);
  });

  it("keeps plain fields with a humanised label", () => {
    const rows = buildCustomerDetailRows({
      delivery_address: "12 Rizal St",
      table_number: 4,
    });

    expect(rows).toEqual([
      { key: "delivery_address", label: "Delivery Address", value: "12 Rizal St" },
      { key: "table_number", label: "Table Number", value: "4" },
    ]);
  });

  it("drops arrays as well as objects", () => {
    const rows = buildCustomerDetailRows({ applied_vouchers: [{ code: "SAVE10" }] });

    expect(rows).toEqual([]);
  });

  it("omits hidden internal fields", () => {
    const rows = buildCustomerDetailRows({
      messenger_psid: "1234567890",
      payment_proof_url: "https://img/x.jpg",
      customer_phone: "09171234567",
      delivery_lat: 14.5,
      delivery_lng: 121.0,
      note: "Extra napkins",
    });

    expect(rows).toEqual([{ key: "note", label: "Note", value: "Extra napkins" }]);
  });

  it("omits null, undefined and blank values", () => {
    const rows = buildCustomerDetailRows({
      note: null,
      landmark: undefined,
      floor: "   ",
    });

    expect(rows).toEqual([]);
  });

  it("renders booleans rather than dropping false", () => {
    const rows = buildCustomerDetailRows({ is_gift: false });

    expect(rows).toEqual([{ key: "is_gift", label: "Is Gift", value: "false" }]);
  });

  it("returns no rows when there is no customer data", () => {
    expect(buildCustomerDetailRows(undefined)).toEqual([]);
  });
});

/**
 * The same rows now feed the receipt's "checkout answers" block, so the blob's
 * platform carrier keys — the branch id, the raw schedule timestamp, the
 * inventory picks — must never reach paper (or the card) as raw rows.
 */
describe("buildCustomerDetailRows — platform carrier keys", () => {
  it("drops the branch id but keeps the branch name, relabelled", () => {
    const rows = buildCustomerDetailRows({
      outlet_id: "1b9f2c3d-0000-4444-8888-aaaaaaaaaaaa",
      outlet_name: "Katipunan",
    });

    expect(rows).toEqual([{ key: "outlet_name", label: "Branch", value: "Katipunan" }]);
  });

  it("drops the raw schedule instant and keeps the label the customer saw", () => {
    const rows = buildCustomerDetailRows({
      scheduled_for: "2026-09-22T07:00:00.000Z",
      scheduled_for_label: "Sep 22, 3:00 PM",
    });

    expect(rows).toEqual([
      { key: "scheduled_for_label", label: "Scheduled For", value: "Sep 22, 3:00 PM" },
    ]);
  });

  it("drops the inventory selections carrier key", () => {
    const rows = buildCustomerDetailRows({
      _inventory_selections: "batch-7",
      landmark: "Beside the blue gate",
    });

    expect(rows).toEqual([
      { key: "landmark", label: "Landmark", value: "Beside the blue gate" },
    ]);
  });
})

/**
 * A redaction guard, not a behaviour test.
 *
 * These rows now print on a customer's paper receipt, so the hidden list is a
 * privacy boundary rather than a tidiness preference. Each key below is
 * written into `customerData` by a real checkout or register path and must
 * never reach the paper: a messenger id or a map coordinate identifies the
 * customer, and a payment reference is a claim on money. Deleting one from
 * HIDDEN_FIELDS is the kind of edit that looks harmless in review, so it
 * fails here instead.
 */
describe("redaction boundary", () => {
  const MUST_NEVER_PRINT = [
    "messenger_psid",
    "delivery_lat",
    "delivery_lng",
    "payment_proof_reference",
    "payment_proof_url",
    "payment_proof_public_id",
    "customer_name",
    "customer_phone",
    "customer_contact",
  ];

  it.each(MUST_NEVER_PRINT)("never renders %s", (key) => {
    const rows = buildCustomerDetailRows({ [key]: "leaked", landmark: "Blue gate" });

    expect(rows.map((row) => row.key)).toEqual(["landmark"]);
  });

  it("drops a structured internal rather than stringifying it", () => {
    const rows = buildCustomerDetailRows({
      pos: { cashierId: "staff-1", cashTendered: 500 },
      discount: { code: "SAVE10", amount: 10 },
      landmark: "Blue gate",
    });

    expect(rows.map((row) => row.key)).toEqual(["landmark"]);
  });
});
