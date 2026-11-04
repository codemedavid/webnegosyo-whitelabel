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
  it("is drawn with BackHeader and the Store sales | My drawer lens", () => {
    expect(screen()).toMatch(/<BackHeader/);
    expect(screen()).toMatch(/"Store sales"/);
    expect(screen()).toMatch(/"My drawer"/);
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
  it("the Drawer's own shift card opens it for the open shift", () => {
    const card = read("components", "drawer", "MyShiftCard.tsx");
    expect(card).toMatch(/label="Shift sales"/);
    expect(card).toMatch(/shiftSalesHref\(shift\.id\)/);
  });

  it("a shift in the history opens it for that shift", () => {
    expect(read("app", "(main)", "staff", "[userId].tsx")).toMatch(/onOpenShift=\{\(shiftId\) => router\.push\(shiftSalesHref\(shiftId\)/);
  });
});
