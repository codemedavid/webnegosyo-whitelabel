/**
 * The printer registry: a device can hold several printers, each with one or
 * both roles — "cashier" (customer receipt) and "kitchen" (chit). Pure list
 * operations only; persistence lives in the store.
 *
 * The migration rule matters most: the legacy single printer printed BOTH the
 * receipt and the kitchen chit, so it must arrive with both roles — anything
 * narrower silently breaks the KDS print button on upgrade.
 */

import {
  addPrinter,
  removePrinter,
  updatePrinter,
  printersForRole,
  migrateLegacyPrinter,
  parsePrinterList,
  suggestedRoles,
  createPrinterId,
  type RegisteredPrinter,
} from "./printer-registry";

const bt = (over: Partial<RegisteredPrinter> = {}): RegisteredPrinter => ({
  id: "p1",
  type: "bluetooth",
  name: "T58",
  address: "AA:BB:CC",
  roles: ["cashier"],
  ...over,
});

describe("createPrinterId", () => {
  it("derives a stable id from the inputs, no ambient randomness", () => {
    expect(createPrinterId(1700000000000, 0.5)).toBe(createPrinterId(1700000000000, 0.5));
    expect(createPrinterId(1700000000000, 0.5)).not.toBe(createPrinterId(1700000000001, 0.5));
  });
});

describe("addPrinter", () => {
  it("appends a new printer without mutating the input list", () => {
    const list: RegisteredPrinter[] = [bt()];
    const next = addPrinter(list, bt({ id: "p2", address: "DD:EE:FF", roles: ["kitchen"] }));

    expect(next).toHaveLength(2);
    expect(list).toHaveLength(1);
  });

  it("replaces an existing printer with the same address, keeping its position", () => {
    const list = [bt(), bt({ id: "p2", address: "DD:EE:FF" })];
    const next = addPrinter(list, bt({ id: "p3", name: "T58 II", roles: ["kitchen"] }));

    expect(next).toHaveLength(2);
    expect(next[0]!.name).toBe("T58 II");
    expect(next[0]!.roles).toEqual(["kitchen"]);
  });
});

describe("removePrinter / updatePrinter", () => {
  it("removes by id and leaves unknown ids alone", () => {
    const list = [bt(), bt({ id: "p2", address: "DD:EE:FF" })];
    expect(removePrinter(list, "p1")).toHaveLength(1);
    expect(removePrinter(list, "nope")).toHaveLength(2);
  });

  it("patches name and roles immutably", () => {
    const list = [bt()];
    const next = updatePrinter(list, "p1", { roles: ["cashier", "kitchen"] });

    expect(next[0]!.roles).toEqual(["cashier", "kitchen"]);
    expect(list[0]!.roles).toEqual(["cashier"]);
  });

  it("refuses to strip the last role — a role-less printer is unreachable", () => {
    const list = [bt()];
    const next = updatePrinter(list, "p1", { roles: [] });

    expect(next[0]!.roles).toEqual(["cashier"]);
  });
});

describe("printersForRole", () => {
  it("returns only printers holding the role, in list order", () => {
    const list = [
      bt({ id: "p1", roles: ["cashier"] }),
      bt({ id: "p2", address: "1:2", roles: ["kitchen"] }),
      bt({ id: "p3", address: "3:4", roles: ["cashier", "kitchen"] }),
    ];

    expect(printersForRole(list, "kitchen").map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(printersForRole(list, "cashier").map((p) => p.id)).toEqual(["p1", "p3"]);
  });
});

describe("migrateLegacyPrinter", () => {
  it("carries the single legacy printer over with BOTH roles", () => {
    const raw = JSON.stringify({ type: "bluetooth", name: "T58", address: "AA:BB:CC" });
    const migrated = migrateLegacyPrinter(raw);

    expect(migrated).toHaveLength(1);
    expect(migrated[0]!.address).toBe("AA:BB:CC");
    expect(migrated[0]!.roles).toEqual(["cashier", "kitchen"]);
  });

  it("yields an empty list for absent or corrupt legacy config", () => {
    expect(migrateLegacyPrinter(null)).toEqual([]);
    expect(migrateLegacyPrinter("not json")).toEqual([]);
    expect(migrateLegacyPrinter(JSON.stringify({ type: "laser" }))).toEqual([]);
  });
});

describe("parsePrinterList", () => {
  it("round-trips a valid list", () => {
    const list = [bt(), bt({ id: "p2", address: "1.2.3.4:9100", type: "network", roles: ["kitchen"] })];
    // Entries saved before paper widths existed come back as 58mm, so a
    // printer that has only ever printed 58mm keeps printing 58mm.
    expect(parsePrinterList(JSON.stringify(list))).toEqual(
      list.map((p) => ({ ...p, paperWidth: 58 })),
    );
  });

  it("drops invalid entries and survives corrupt storage", () => {
    expect(parsePrinterList(null)).toEqual([]);
    expect(parsePrinterList("{broken")).toEqual([]);
    expect(parsePrinterList(JSON.stringify({ not: "an array" }))).toEqual([]);

    const mixed = JSON.stringify([bt(), { id: "x", type: "laser", roles: [] }]);
    expect(parsePrinterList(mixed)).toHaveLength(1);
  });
});

describe("suggestedRoles", () => {
  it("gives the very first printer both roles — parity with the legacy single printer", () => {
    expect(suggestedRoles([])).toEqual(["cashier", "kitchen"]);
  });

  it("suggests the missing role once one side is covered", () => {
    expect(suggestedRoles([bt({ roles: ["cashier"] })])).toEqual(["kitchen"]);
    expect(suggestedRoles([bt({ roles: ["kitchen"] })])).toEqual(["cashier"]);
  });

  it("defaults to cashier when both roles are already covered", () => {
    expect(suggestedRoles([bt({ roles: ["cashier", "kitchen"] })])).toEqual(["cashier"]);
  });
});

describe("paper width", () => {
  // The driver rasterizes a QR into a strip as wide as the print head it is
  // told about, and defaults to 80mm. A 58mm printer given a 576-dot strip
  // clips the right third of the code — it prints, and never scans.
  it("reads a saved 80mm width", () => {
    const parsed = parsePrinterList(
      JSON.stringify([{ ...bt(), paperWidth: 80 }]),
    );
    expect(parsed[0]?.paperWidth).toBe(80);
  });

  it("treats an absent or unknown width as 58mm — the common counter printer", () => {
    const parsed = parsePrinterList(
      JSON.stringify([bt(), { ...bt({ address: "DD:EE:FF" }), paperWidth: 72 }]),
    );
    expect(parsed[0]?.paperWidth).toBe(58);
    expect(parsed[1]?.paperWidth).toBe(58);
  });

  it("migrates the legacy single printer as 58mm", () => {
    const [printer] = migrateLegacyPrinter(
      JSON.stringify({ type: "bluetooth", name: "T58", address: "AA:BB:CC" }),
    );
    expect(printer?.paperWidth).toBe(58);
  });

  it("lets a printer be re-labelled 80mm in place", () => {
    const list = updatePrinter([bt()], "p1", { paperWidth: 80 });
    expect(list[0]?.paperWidth).toBe(80);
  });
});
