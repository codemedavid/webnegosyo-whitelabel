import { clearedSaleTable, isDineInType, tableCustomerData, type PosTableDetails } from "./pos-table";

describe("clearedSaleTable", () => {
  it("is a sale with no table", () => {
    expect(clearedSaleTable()).toEqual({ table: { label: null, tableId: null, partySize: null } });
  });
});

describe("tableCustomerData", () => {
  it("writes the table under the key every reader already looks for", () => {
    const table: PosTableDetails = { label: "table 12", tableId: "t1", partySize: 3 };
    expect(tableCustomerData(table)).toEqual({ table_number: "12", party_size: 3 });
  });

  it("leaves the party out when none was taken", () => {
    expect(tableCustomerData({ label: "A3", tableId: null, partySize: null })).toEqual({ table_number: "A3" });
  });

  it("writes nothing for a sale with no table, or one whose label is only a prefix", () => {
    expect(tableCustomerData(null)).toEqual({});
    expect(tableCustomerData(undefined)).toEqual({});
    expect(tableCustomerData(clearedSaleTable().table)).toEqual({});
    expect(tableCustomerData({ label: "Table ", tableId: null, partySize: null })).toEqual({});
  });
});

describe("isDineInType", () => {
  it("keys on the machine kind, never the merchant's label", () => {
    expect(isDineInType({ type: "dine_in" })).toBe(true);
    expect(isDineInType({ type: "pickup" })).toBe(false);
    expect(isDineInType({ type: "Dine In" })).toBe(false);
    expect(isDineInType(undefined)).toBe(false);
  });
});
