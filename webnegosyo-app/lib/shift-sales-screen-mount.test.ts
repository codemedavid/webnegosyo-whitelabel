// Guardrails for Shift sales (P1, CONTRACTS §7). Like the other mount
// guardrails this reads sources: the screen exists where expo-router finds
// it, is drawn with BackHeader, routes through the store's backend (server
// report on platform, the tablet's count otherwise), never shows a sample
// outside the demo, and has its doors on the Drawer and in shift history.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const screen = () => read("app", "(main)", "shift-sales.tsx");

describe("Shift sales screen", () => {
  it("is drawn with BackHeader and the My sales | Store sales | My drawer lenses (lib/cash/shift-sales-lens.ts)", () => {
    expect(screen()).toMatch(/<BackHeader/);
    // The labels moved into the lens rules so a plain cashier's set can be tested.
    expect(screen()).toMatch(/lensOptions\(\{ canSeeStore, isMine \}\)/);
    const lenses = read("lib", "cash", "shift-sales-lens.ts");
    for (const label of ['"My sales"', '"Store sales"', '"My drawer"']) expect(lenses).toContain(label);
  });

  it("owner decision 2026-11-04: a plain cashier is only ever asked her own sales, and opens on them", () => {
    expect(screen()).toMatch(/canSeeStoreSales\(\{ role, isOwner, permissions \}\)/);
    expect(screen()).toMatch(/scope: reportScopeFor\(lens, canSeeStore\)/);
    // Re-derived on focus / param change: the screen never unmounts.
    expect(screen()).toMatch(/useShiftSalesLens\(\{/);
    expect(read("lib", "cash", "use-shift-sales-lens.ts")).toMatch(/initialLens\(\{/);
    // The tablet's own count narrows to her sales too.
    expect(screen()).toMatch(/cashierId,\n/);
  });

  it("shows her report's paper exactly as it prints, with a printing / printed / failed line", () => {
    expect(screen()).toMatch(/slipPlainText\(buildShiftReportSlip\(report/);
    expect(screen()).toMatch(/printStateText\(printer\.state\)/);
    expect(screen()).toMatch(/printer\.noPrinterMessage/);
  });

  it("asks the server report only on the platform backend, and counts on the tablet otherwise", () => {
    expect(screen()).toMatch(/useServerShiftSales\(target, !isDemo && orderBackend === "platform"\)/);
    expect(screen()).toMatch(/needsDeviceCount\(server\.read\)/);
    expect(screen()).toMatch(/countShiftSalesOnDevice/);
  });

  it("shows the sample report only in the demo, and refuses printing there", () => {
    expect(screen()).toMatch(/isDemo \? sampleShiftSales/);
    expect(screen()).toMatch(/DEMO_READONLY_MESSAGE/);
  });

  it("hides money in blind count for anyone but a cash manager while the shift is open", () => {
    expect(screen()).toMatch(/shift\.isBlind && shift\.status === "open" && !canManage/);
  });

  it("has every state: skeleton, locked, unavailable, error with retry", () => {
    for (const piece of ["ShiftSalesSkeleton", "EmptyState icon=\"lock\"", "Can't add this shift up here", "ErrorState", "onRetry"]) {
      expect(screen()).toContain(piece);
    }
    expect(screen()).toMatch(/OfflineOrdersNotice/);
  });

  it("opens a receipt on the existing order screen", () => {
    expect(screen()).toMatch(/\/\(main\)\/order\/\$\{orderId\}/);
  });
});

describe("Shift sales doors", () => {
  it("the Drawer's own shift card opens it for the open shift, on her own sales", () => {
    const card = read("components", "drawer", "MyShiftCard.tsx");
    expect(card).toMatch(/label="Shift sales"/);
    expect(card).toMatch(/myShiftSalesHref\(shift\.id\)/);
  });

  it("End shift and the remittance slip offer Print my shift report", () => {
    const endShift = read("app", "(main)", "end-shift.tsx");
    expect(endShift).toMatch(/step === "result" \|\| step === "remit"[\s\S]{0,80}<ShiftReportCard shiftId=\{shift\.id\}/);
    expect(read("app", "(main)", "remittance.tsx")).toMatch(/<ShiftReportCard shiftId=\{shiftId\} tone="primary"/);
    const card = read("components", "shift-sales", "ShiftReportCard.tsx");
    expect(card).toMatch(/label="Print my shift report"/);
    expect(card).toMatch(/scope: "cashier"/);
  });

  it("a shift in the history opens it for that shift", () => {
    expect(read("app", "(main)", "staff", "[userId].tsx")).toMatch(/onOpenShift=\{\(shiftId\) => router\.push\(shiftSalesHref\(shiftId\)/);
  });
});
