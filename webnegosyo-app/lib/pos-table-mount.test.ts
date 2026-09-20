// Guardrails for the table on a register sale. The pure slice
// (lib/pos-table.ts) and the store journey are unit-tested; this pins the
// WIRING, which is where a table would otherwise quietly stop reaching the
// order: the tender reads the slice, the register offers the picker, the
// cart sheet shows the row, and the floor hands a table to the register.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const read = (...segments: string[]) => readFileSync(join(ROOT, ...segments), "utf8");

describe("the table reaches the placed order", () => {
  it("is read off the sale at tender, beside the delivery details", () => {
    expect(read("app", "(main)", "pos-tender.tsx")).toMatch(/table: usePosCartStore\.getState\(\)\.table/);
  });

  it("is folded into customerData by the order builder", () => {
    expect(read("lib", "pos-order.ts")).toMatch(/tableCustomerData\(context\.table\)/);
  });
});

describe("the register offers the picker", () => {
  const pos = read("app", "(main)", "pos.tsx");

  it("mounts the table picker with the store's floor", () => {
    expect(pos).toMatch(/<PosTablePickerSheet/);
    expect(pos).toMatch(/useDiningTables\(\)/);
  });

  it("tells the store the chosen type's kind, so a non-dine-in type drops the table", () => {
    expect(pos).toMatch(/setOrderType\(type\.id, type\.name, type\.serviceCharge, pricingFor\(type\), type\.type\)/);
  });

  it("hides the picker while editing a placed order", () => {
    expect(pos).toMatch(/onEditTable=\{edit \? undefined : /);
  });

  it("shows the table row only on a dine-in sale", () => {
    const sheet = read("components", "pos", "CartSheet.tsx");
    expect(sheet).toMatch(/isDineInType\(activeType\)/);
    expect(sheet).toMatch(/onEditTable && isDineIn &&/);
  });
});

describe("the floor hands a table to the register", () => {
  const floor = read("app", "(main)", "tables.tsx");

  it("starts a dine-in sale with the type's kind and the table, through the tab-aware router", () => {
    expect(floor).toMatch(/register\.setOrderType\(/);
    expect(floor).toMatch(/dineInType\.type,/);
    expect(floor).toMatch(/register\.setTable\(/);
    expect(floor).toMatch(/goTo\(router, "\/\(main\)\/pos"\)/);
    expect(floor).not.toMatch(/router\.replace\(/);
  });

  it("never merges onto a sale already on the counter without asking", () => {
    expect(floor).toMatch(/register\.lines\.length > 0 \|\| register\.editContext/);
  });
});
