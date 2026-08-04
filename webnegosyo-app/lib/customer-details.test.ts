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
