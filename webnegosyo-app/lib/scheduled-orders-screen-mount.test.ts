// Guardrails for the Scheduled Orders tab. Jest only runs pure-logic roots, so
// like the kitchen guardrail this asserts on source: the tab is registered
// everywhere a tab must be registered, it is additionally gated on the store
// actually taking pre-orders (a merchant who never enabled advance ordering
// must never see a dead tab), it rides the existing `orders` permission
// explicitly (an unmapped tab defaults to ALLOWED), and the screen builds its
// agenda from the shared scheduled-orders logic over the shared order reads.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { getWorkspace, workspaceForTab } from "./workspaces";
import { isTabAllowed } from "./staff-permissions";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const screen = () => read("app", "(main)", "scheduled.tsx");

describe("scheduled tab registration", () => {
  it("belongs to the Operations view, beside the queue it feeds", () => {
    expect(workspaceForTab("scheduled")).toBe("operations");
    expect(getWorkspace("operations").tabs).toContain("scheduled");
  });

  it("has a route file, so registering it cannot break the tab bar", () => {
    expect(existsSync(join(ROOT, "app", "(main)", "scheduled.tsx"))).toBe(true);
  });

  it("is registered in the tab layout behind both gates", () => {
    const layout = read("app", "(main)", "_layout.tsx");
    // The standard three-gate show() AND the advance-ordering config gate: the
    // tab renders only for stores with a pre-order-enabled order type.
    expect(layout).toMatch(/name="scheduled"[\s\S]{0,240}show\("scheduled"\)/);
    expect(layout).toMatch(/useAdvanceOrdering/);
  });
});

describe("scheduled tab permission", () => {
  it("rides the orders grant — the schedule is the order queue, time-sorted", () => {
    const orderStaff = { role: "admin", isOwner: false, permissions: ["orders"] };
    expect(isTabAllowed(orderStaff, "scheduled")).toBe(true);
  });

  it("keeps staff without the orders grant out", () => {
    const cashier = { role: "admin", isOwner: false, permissions: ["pos"] };
    expect(isTabAllowed(cashier, "scheduled")).toBe(false);
  });

  it("stays open to owners and legacy full-access accounts", () => {
    expect(isTabAllowed({ role: "admin", isOwner: true, permissions: [] }, "scheduled")).toBe(true);
    expect(isTabAllowed({ role: "admin", isOwner: false, permissions: null }, "scheduled")).toBe(
      true,
    );
  });
});

describe("scheduled screen", () => {
  it("builds its agenda from the shared scheduled-orders logic, not a second opinion", () => {
    expect(screen()).toMatch(/selectScheduledOrders/);
    expect(screen()).toMatch(/buildDateStrip/);
    expect(screen()).toMatch(/groupByTime/);
  });

  it("reads orders through the backend-routed hooks both backends support", () => {
    expect(screen()).toMatch(/orders:getOrders/);
    expect(screen()).toMatch(/useSafeQuery/);
  });

  it("scopes the agenda to the branch in view", () => {
    expect(screen()).toMatch(/useBranchScope/);
    expect(screen()).toMatch(/filterOrdersToScope/);
  });

  it("keeps the workspace switcher so the tab is escapable", () => {
    expect(screen()).toMatch(/WorkspaceSwitcher/);
  });

  it("opens the shared order detail rather than growing its own management UI", () => {
    expect(screen()).toMatch(/order\/\$\{|order\/\[|\/order\//);
  });
});
