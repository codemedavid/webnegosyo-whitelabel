// Guardrails for the app-wide kitchen auto-print watcher. Jest only runs
// pure-logic roots here, so like the other mount guardrails this asserts on
// the component source: it must be mounted once in the tab layout (auto-print
// works from ANY tab, not just the kitchen board), gated hard on the toggle,
// a kitchen-role printer, demo mode, and a live backend, and it must reuse
// the shared new-ticket and decision logic rather than a second opinion.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const component = () => read("components", "GlobalKitchenAutoPrint.tsx");

describe("GlobalKitchenAutoPrint mounting", () => {
  it("is mounted once in the (main) tab layout, beside the order alerts", () => {
    const layout = read("app", "(main)", "_layout.tsx");
    expect(layout).toMatch(/<GlobalKitchenAutoPrint \/>/);
    expect(layout).toMatch(/GlobalOrderAlerts/);
  });
});

describe("GlobalKitchenAutoPrint gates", () => {
  it("only arms with the toggle on, a kitchen printer saved, off demo, on a live backend", () => {
    const src = component();
    expect(src).toMatch(/kitchenAutoPrint/);
    expect(src).toMatch(/printersForRole\(printers, "kitchen"\)/);
    expect(src).toMatch(/!isDemo/);
    expect(src).toMatch(/hasLiveOrderBackend/);
  });

  it("subscribes through the backend-routed hooks the kitchen board uses", () => {
    const src = component();
    expect(src).toMatch(/orders:getOrders/);
    expect(src).toMatch(/orders:getAllOrderItems/);
    expect(src).toMatch(/useSafeQuery/);
  });

  it("scopes to the branch in view, like every other order surface", () => {
    const src = component();
    expect(src).toMatch(/useBranchScope/);
    expect(src).toMatch(/filterOrdersToScope/);
  });
});

describe("GlobalKitchenAutoPrint logic reuse", () => {
  it("detects new tickets with the shared scan — first snapshot never prints", () => {
    expect(component()).toMatch(/scanNewTickets/);
    expect(component()).toMatch(/selectKitchenTickets/);
  });

  it("decides and dedups through the shared auto-print module", () => {
    const src = component();
    expect(src).toMatch(/selectTicketsToAutoPrint/);
    expect(src).toMatch(/claimPrinted\(/);
    expect(src).toMatch(/usePrintedLedger\(/);
  });

  it("prints the shared chit on kitchen-role printers", () => {
    const src = component();
    expect(src).toMatch(/buildKitchenChitSegments/);
    expect(src).toMatch(/printForRole\(\s*\n?\s*"kitchen"/);
  });
});
