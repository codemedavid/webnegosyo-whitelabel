import type { ShiftRecord } from "../shift-service";
import { drawerChipLabel } from "./add-expense-form";
import { drawerModeFor, drawerSourceLabel, floorDrawerSource, payableDrawers, type DrawerSource } from "./drawer-sources";

function shift(overrides: Partial<ShiftRecord> & { id: string }): ShiftRecord {
  return {
    outletId: null,
    staffUserId: `user-${overrides.id}`,
    staffName: "Ana",
    status: "open",
    openingFloat: 500,
    expectedCash: null,
    closingCount: null,
    note: null,
    openedAt: "2026-10-26T00:00:00.000Z",
    closedAt: null,
    drawerId: null,
    drawerName: null,
    isZeroBalance: false,
    closedByName: null,
    ...overrides,
  };
}

const mine = shift({ id: "s-me", staffName: "Olivia", drawerName: "Front till" });
const ana = shift({ id: "s-ana", staffName: "Ana", drawerName: "Cashier 2" });
const ben = shift({ id: "s-ben", staffName: "Ben", drawerName: "Cashier 1" });
const personal = shift({ id: "s-cy", staffName: "Cy", drawerName: null });

describe("payableDrawers", () => {
  test("a cash manager may take from every open drawer: their own first, then tills by name, then personal drawers", () => {
    // Arrange
    const openShifts = [ana, mine, ben, personal];

    // Act
    const sources = payableDrawers({ openShifts, myShift: mine, canManageCash: true });

    // Assert
    expect(sources.map((source) => [source.shiftId, source.isMine])).toEqual([
      ["s-me", true],
      ["s-ben", false],
      ["s-ana", false],
      ["s-cy", false],
    ]);
  });

  test("anyone else may take only from their own open drawer", () => {
    expect(payableDrawers({ openShifts: [ana, mine, ben], myShift: mine, canManageCash: false }).map((s) => s.shiftId)).toEqual(["s-me"]);
    expect(payableDrawers({ openShifts: [ana, ben], myShift: null, canManageCash: false })).toEqual([]);
  });

  test("closed shifts are never offered, and my shift is not listed twice", () => {
    const closed = shift({ id: "s-old", status: "closed" });
    const sources = payableDrawers({ openShifts: [mine, closed], myShift: shift({ id: "s-me2", status: "closed" }), canManageCash: true });
    expect(sources.map((s) => s.shiftId)).toEqual(["s-me"]);
  });

  test("the balance is unknown here (it needs the register's sales)", () => {
    expect(payableDrawers({ openShifts: [ana], myShift: null, canManageCash: true })[0].availableCents).toBeNull();
  });
});

describe("drawerSourceLabel", () => {
  const source = (overrides: Partial<DrawerSource>): DrawerSource => ({
    shiftId: "x",
    drawerName: "Cashier 1",
    staffName: "Ana",
    isMine: false,
    availableCents: null,
    ...overrides,
  });

  test("names the till and who holds it", () => {
    expect(drawerSourceLabel(source({}))).toBe("Cashier 1 · Ana");
    expect(drawerSourceLabel(source({ drawerName: null }))).toBe("Ana's drawer");
    expect(drawerSourceLabel(source({ isMine: true }))).toBe("Cashier 1 · You");
    expect(drawerSourceLabel(source({ isMine: true, drawerName: null }))).toBe("Your drawer");
  });
});

describe("drawerModeFor", () => {
  test("someone else's till reads with their shift on the sheet's chip", () => {
    // Arrange
    const [source] = payableDrawers({ openShifts: [ben], myShift: null, canManageCash: true });

    // Act
    const mode = drawerModeFor(source);

    // Assert
    expect(mode).toEqual({ kind: "drawer", shiftId: "s-ben", drawerName: "Cashier 1", availableCents: null, shiftLabel: "Ben's shift" });
    expect(drawerChipLabel(mode)).toBe("Cashier 1 drawer · Ben's shift");
  });

  test("a personal drawer is named after its holder", () => {
    const [source] = payableDrawers({ openShifts: [personal], myShift: null, canManageCash: true });
    expect(drawerChipLabel(drawerModeFor(source))).toBe("Cy's drawer");
  });

  test("my own drawer keeps the register's wording", () => {
    const [source] = payableDrawers({ openShifts: [], myShift: shift({ id: "s-me", drawerName: null }), canManageCash: false });
    expect(drawerChipLabel(drawerModeFor(source))).toBe("Your drawer");
  });
});

describe("floorDrawerSource", () => {
  test("what the drawer should hold, less what this phone already took and has not synced", () => {
    expect(floorDrawerSource(ben, { isMine: false, expectedInDrawer: 3240.5, pendingCents: 12000 }).availableCents).toBe(312050);
  });

  test("unknown stays unknown", () => {
    expect(floorDrawerSource(ben, { isMine: false, expectedInDrawer: null, pendingCents: 500 }).availableCents).toBeNull();
  });
});
