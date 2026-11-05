// Guardrails for the Orders tab as Order History (plan §2). Like the other
// mount guardrails, this reads the screen source: the logic suite does not
// render Expo Router screens.
//
// What it pins:
//   - one-tap Today / Yesterday / Last 7 days / This month (quick picks built
//     on the store's business day), with the live queue still the default;
//   - a picked period reads the whole window (up to the windowed cap), not a
//     silent 2,000, and says so when it reaches the cap;
//   - Export follows the picked days;
//   - the item summary is gated on `reports` and on platform stores, and goes
//     through the shared reader + slip.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const screen = () => read("app", "(main)", "orders.tsx");

describe("Orders tab period bar", () => {
  it("offers the quick picks and keeps the live queue as the default", () => {
    const source = screen();
    expect(source).toMatch(/orderHistoryQuickPicks\(/);
    expect(source).toMatch(/quickPicks=\{/);
    expect(source).toMatch(/customLabel="Custom"/);
    expect(source).toMatch(/clearLabel="Live queue"/);
    expect(source).toMatch(/useState<ReportSelection \| null>\(null\)/);
  });

  it("anchors the picks on the store's business day, not a clock pinned at mount", () => {
    const source = screen();
    expect(source).toMatch(/anchorMs/);
    expect(source).not.toMatch(/const \[nowMs\] = useState\(\(\) => Date\.now\(\)\)/);
  });
});

describe("Orders tab dated read", () => {
  it("reads the picked window through the windowed reader, not a fixed 2,000 page", () => {
    const source = screen();
    expect(source).toMatch(/datedOrdersArgs\(/);
    expect(source).not.toMatch(/DATED_FETCH_LIMIT = 2000/);
  });

  it("says when the list reached its cap", () => {
    expect(screen()).toMatch(/orderHistoryCapNotice\(/);
  });

  it("exports the picked days when dates are picked", () => {
    const source = screen();
    expect(source).toMatch(/orderHistoryExportFileName\(/);
    expect(source).toMatch(/showPresets=\{!dateSelection\}/);
  });
});

describe("Orders tab item summary", () => {
  it("is switched by the gated toggle and drawn by the summary panel", () => {
    const source = screen();
    expect(source).toMatch(/<OrderHistoryViewSwitch/);
    expect(source).toMatch(/<OrderHistorySummary/);
    expect(source).toMatch(/resolveItemSummaryAccess\(/);
    expect(read("components", "order-history", "OrderHistorySummary.tsx")).toMatch(/<ItemSummaryPanel/);
  });

  it("reads through the caller-session reader and prints on the cashier printer path", () => {
    const hook = read("lib", "reports", "use-item-summary.ts");
    expect(hook).toMatch(/fetchItemSummary\(/);
    expect(hook).not.toMatch(/service_role|SERVICE_ROLE/);
    const print = read("lib", "reports", "item-summary-print.ts");
    expect(print).toMatch(/printForRole\("cashier"/);
    expect(print).toMatch(/NO_PRINTER_MESSAGE/);
  });
});
