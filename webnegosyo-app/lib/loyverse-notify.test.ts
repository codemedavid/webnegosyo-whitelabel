// The module under test imports web-app-url (expo-constants) and supabase for
// its network path; the pure mapper needs neither.
jest.mock("./web-app-url", () => ({
  __esModule: true,
  getWebAppUrl: () => "https://example.test",
}));
jest.mock("./supabase", () => ({
  __esModule: true,
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { posLinesToLoyverseOrderLines } from "./loyverse-notify";

describe("posLinesToLoyverseOrderLines", () => {
  it("routes selections by their synced option-id prefix", () => {
    const lines = posLinesToLoyverseOrderLines([
      {
        menuItemId: "mi-1",
        name: "Americano",
        quantity: 2,
        unitPrice: 160,
        subtotal: 320,
        note: "no sugar",
        selections: [
          { groupName: "Size", optionId: "lv-var_l", optionName: "Large" },
          { groupName: "Extras", optionId: "lvm-opt_1", optionName: "Extra shot" },
        ],
      },
    ]);

    expect(lines).toEqual([
      {
        menu_item_id: "mi-1",
        menu_item_name: "Americano",
        variations: { Size: "Large" },
        addons: ["Extra shot"],
        quantity: 2,
        price: 160,
        subtotal: 320,
        special_instructions: "no sugar",
      },
    ]);
  });

  it("sends unsynced selections through both channels so the server can match either", () => {
    const lines = posLinesToLoyverseOrderLines([
      {
        menuItemId: "mi-2",
        name: "Latte",
        quantity: 1,
        unitPrice: 150,
        subtotal: 150,
        selections: [{ groupName: "Milk", optionId: "opt-local", optionName: "Oat" }],
      },
    ]);

    expect(lines[0].variations).toEqual({ Milk: "Oat" });
    expect(lines[0].addons).toEqual(["Oat"]);
  });

  it("omits the variations map when nothing is selected", () => {
    const lines = posLinesToLoyverseOrderLines([
      {
        menuItemId: "mi-3",
        name: "Water",
        quantity: 1,
        unitPrice: 20,
        subtotal: 20,
        selections: [],
      },
    ]);
    expect(lines[0].variations).toBeUndefined();
    expect(lines[0].addons).toEqual([]);
  });
});
