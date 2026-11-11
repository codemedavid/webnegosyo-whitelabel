// Guardrails for the Kitchen Display tab. Like the other mount guardrails in
// this directory, Jest only runs pure-logic roots, so this asserts on the
// screen source rather than rendering it: the tab is registered everywhere a
// tab must be registered, it is gated on the new `kitchen` permission (an
// unmapped tab defaults to ALLOWED, which would put the kitchen board in front
// of every staffer), and the screen defers to the shared ticket logic.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace, workspaceForTab } from "./workspaces";
import { isTabAllowed, STAFF_PERMISSION_KEYS } from "./staff-permissions";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const screen = () => read("app", "(main)", "kitchen.tsx");

describe("kitchen tab registration", () => {
  it("belongs to the Operations view, beside the queue it serves", () => {
    expect(workspaceForTab("kitchen")).toBe("operations");
    expect(getWorkspace("operations").tabs).toContain("kitchen");
  });

  it("has a route file, so registering it cannot break the tab bar", () => {
    expect(existsSync(join(ROOT, "app", "(main)", "kitchen.tsx"))).toBe(true);
  });

  it("is registered in the tab layout with the same visibility gate", () => {
    expect(read("app", "(main)", "_layout.tsx")).toMatch(
      /name="kitchen"[\s\S]{0,160}href: show\("kitchen"\)/,
    );
  });
});

describe("kitchen permission", () => {
  it("exists in the app registry", () => {
    expect(STAFF_PERMISSION_KEYS).toContain("kitchen");
  });

  it("keeps staff without the grant off the board", () => {
    const cashier = { role: "admin", isOwner: false, permissions: ["pos"] };
    expect(isTabAllowed(cashier, "kitchen")).toBe(false);
  });

  it("lets kitchen staff in", () => {
    const cook = { role: "admin", isOwner: false, permissions: ["kitchen"] };
    expect(isTabAllowed(cook, "kitchen")).toBe(true);
  });

  it("stays open to owners and legacy full-access accounts", () => {
    expect(isTabAllowed({ role: "admin", isOwner: true, permissions: [] }, "kitchen")).toBe(true);
    expect(isTabAllowed({ role: "admin", isOwner: false, permissions: null }, "kitchen")).toBe(true);
  });
});

describe("kitchen screen", () => {
  it("builds its board from the shared ticket logic, not a second opinion", () => {
    expect(screen()).toMatch(/selectKitchenTickets/);
    expect(screen()).toMatch(/aggregateAllDay/);
  });

  it("reads orders and items through the backend-routed hooks", () => {
    expect(screen()).toMatch(/orders:getOrders/);
    expect(screen()).toMatch(/orders:getAllOrderItems/);
    expect(screen()).toMatch(/useSafeQuery/);
  });

  it("bumps through the shared status mutation", () => {
    expect(screen()).toMatch(/orders:updateOrderStatus/);
  });

  it("scopes the board to the branch in view", () => {
    expect(screen()).toMatch(/useBranchScope/);
    expect(screen()).toMatch(/filterOrdersToScope/);
  });

  it("adapts its columns to the screen width — phone rail, tablet grid", () => {
    expect(screen()).toMatch(/useWindowDimensions/);
  });

  it("keeps the display awake through a service", () => {
    expect(screen()).toMatch(/useKeepAwake/);
  });

  it("prints chits through the shared chit layout, on kitchen-role printers", () => {
    expect(screen()).toMatch(/buildKitchenChitSegments/);
    expect(screen()).toMatch(/printForRole\(\s*\n?\s*"kitchen"/);
  });

  it("asks the server before a bump, recall or confirm, and refuses a cancelled order", () => {
    // A stale board once wrote a cancelled order back to `ready`: resurrected,
    // its stock restored by the cancel and never spent again.
    const source = screen();
    expect(source.match(/guardKitchenStatusWrite\(/g)?.length).toBe(3);
    expect(source.match(/await readFreshStatus\(/g)?.length).toBe(3);
  });

  it("rings new tickets until confirmed, only while the board is on screen", () => {
    // The tab never unmounts: without the focus gate a cashier who once opened
    // Kitchen would hear the kitchen ring on the register.
    const source = screen();
    expect(source).toMatch(/trackRinging\(/);
    expect(source).toMatch(/useKitchenRing\(\{[^}]*enabled: isFocused && !isDemo/);
    expect(source).toMatch(/<RingStatusBar/);
  });

  it("confirms through the shared rule and remembers its own taps", () => {
    // confirmWritePlan keeps Confirm from pulling a ready plate back to
    // preparing; the local registry keeps this device's banner quiet.
    const source = screen();
    expect(source).toMatch(/confirmWritePlan\(previousStatus\)/);
    expect(source).toMatch(/rememberConfirmedHere\(/);
    expect(source).toMatch(/onConfirm=\{handleConfirm\}/);
  });

  it("blocks the demo session from bumping a real store's orders", () => {
    expect(screen()).toMatch(/isDemo/);
  });

  it("keeps the workspace switcher so the tab is escapable", () => {
  });
});
