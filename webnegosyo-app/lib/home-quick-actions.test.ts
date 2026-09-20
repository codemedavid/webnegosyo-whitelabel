import { QUICK_ACTIONS, MIN_QUICK_ACTIONS, quickActionsFor } from "./home-quick-actions";
import { isTabReachable, type TabVisibilityContext } from "./tab-visibility";

const owner: TabVisibilityContext = {
  caller: { role: "admin", isOwner: true, permissions: null },
  audience: { accountScope: { kind: "all" }, activeOutletCount: 1, isDemo: false },
  takesAdvanceOrders: false,
  takesDineIn: false,
};

const keys = (ctx: TabVisibilityContext) => quickActionsFor(ctx).map((a) => a.key);

describe("quickActionsFor", () => {
  it("offers an owner every shortcut, in the order they are done most", () => {
    expect(keys(owner)).toEqual(["sell", "kitchen", "products"]);
  });

  it("gates each shortcut on the screen it opens", () => {
    // The same rule as the bar and the hubs, so a tile never lands on a
    // screen that refuses the account.
    for (const action of QUICK_ACTIONS) {
      expect(action.href).toBe(`/(main)/${action.gateTab}`);
    }
    const cook = {
      ...owner,
      caller: { role: "admin", isOwner: false, permissions: ["kitchen", "menu"] },
    };
    expect(keys(cook)).toEqual(["kitchen", "products"]);
    expect(isTabReachable("pos", cook)).toBe(false);
  });

  it("hides the row rather than draw a single tile", () => {
    // A cashier reaches only the register, so one tile would survive.
    const cashier = { ...owner, caller: { role: "admin", isOwner: false, permissions: ["pos"] } };
    expect(keys(cashier)).toEqual([]);
    const nobody = { ...owner, caller: { role: "admin", isOwner: false, permissions: [] } };
    expect(keys(nobody)).toEqual([]);
    expect(MIN_QUICK_ACTIONS).toBe(2);
  });

  it("never repeats a shortcut the header already carries", () => {
    // Home's header has a QR button on every render; a "Scan pickup" tile
    // under it was the same door drawn twice.
    for (const action of QUICK_ACTIONS) {
      expect(action.href).not.toBe("/(main)/scan");
    }
  });

  it("names only real screens inside the tab navigator", () => {
    for (const action of QUICK_ACTIONS) {
      expect(action.href.startsWith("/(main)/")).toBe(true);
      expect(action.label.length).toBeGreaterThan(0);
    }
  });
});
