/**
 * Table numbers ride in the customer blob under `table_number` (the checkout
 * convention the Messenger formatter and cart summary already key on). One
 * resolver reads it for the card, the kitchen ticket, and the receipt so a
 * table the customer typed is never shown in one place and missing in another.
 */
import {
  TABLE_NUMBER_FIELD_NAME,
  getOrderTableNumber,
  normalizeTableNumber,
} from "./order-table-number";

describe("normalizeTableNumber", () => {
  it("keeps a plain number", () => {
    expect(normalizeTableNumber("12")).toBe("12");
  });

  it("strips a spoken 'Table' / '#' prefix and collapses whitespace", () => {
    expect(normalizeTableNumber(" Table 12 ")).toBe("12");
    expect(normalizeTableNumber("table#7")).toBe("7");
    expect(normalizeTableNumber("#  3")).toBe("3");
    expect(normalizeTableNumber("Tbl. 9")).toBe("9");
  });

  it("uppercases alphanumeric codes so A3 and a3 are one table", () => {
    expect(normalizeTableNumber("a3")).toBe("A3");
    expect(normalizeTableNumber("patio - 2")).toBe("PATIO - 2");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeTableNumber("")).toBe("");
    expect(normalizeTableNumber("   ")).toBe("");
    expect(normalizeTableNumber("Table")).toBe("");
  });
});

describe("getOrderTableNumber", () => {
  it("reads the checkout field name", () => {
    expect(TABLE_NUMBER_FIELD_NAME).toBe("table_number");
    expect(getOrderTableNumber({ table_number: "12" })).toBe("12");
  });

  it("normalizes what it reads", () => {
    expect(getOrderTableNumber({ table_number: " table 4 " })).toBe("4");
  });

  it("returns null for a missing, blank, or non-string value", () => {
    expect(getOrderTableNumber(undefined)).toBeNull();
    expect(getOrderTableNumber(null)).toBeNull();
    expect(getOrderTableNumber({})).toBeNull();
    expect(getOrderTableNumber({ table_number: "" })).toBeNull();
    expect(getOrderTableNumber({ table_number: 12 })).toBeNull();
    expect(getOrderTableNumber("not an object")).toBeNull();
  });
});
