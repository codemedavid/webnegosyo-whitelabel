// Guardrails for the app-wide confirmation-receipt watcher. Like the kitchen
// auto-print guardrail this asserts on the component source: it must be
// mounted once in the tab layout (a confirm from ANY screen prints), gated on
// the print trigger, a cashier-role printer, demo mode and a live backend, and
// it must reuse the shared transition scan and decision logic.
//
// It also pins the other half of the fix: the screens that used to print (or
// nag) on confirm must not, or a confirm from the order screen prints twice.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const component = () => read("components", "GlobalReceiptAutoPrint.tsx");

describe("GlobalReceiptAutoPrint mounting", () => {
  it("is mounted once in the (main) tab layout, beside the kitchen watcher", () => {
    const layout = read("app", "(main)", "_layout.tsx");
    expect(layout).toMatch(/<GlobalReceiptAutoPrint \/>/);
    expect(layout).toMatch(/<GlobalKitchenAutoPrint \/>/);
  });
});

describe("GlobalReceiptAutoPrint gates", () => {
  it("only arms on a confirmation trigger, a cashier printer, off demo, on a live backend", () => {
    const src = component();
    expect(src).toMatch(/shouldPrintAt\("confirmation", printTrigger\)/);
    expect(src).toMatch(/printersForRole\(printers, "cashier"\)/);
    expect(src).toMatch(/!isDemo/);
    expect(src).toMatch(/hasLiveOrderBackend/);
  });

  it("subscribes through the backend-routed hooks every order surface uses", () => {
    const src = component();
    expect(src).toMatch(/orders:getOrders/);
    expect(src).toMatch(/orders:getAllOrderItems/);
    expect(src).toMatch(/useSafeQuery/);
  });

  it("scopes to the branch in view", () => {
    const src = component();
    expect(src).toMatch(/useBranchScope/);
    expect(src).toMatch(/filterOrdersToScope/);
  });
});

describe("GlobalReceiptAutoPrint logic reuse", () => {
  it("detects the confirmation transition with the shared scan — first snapshot never prints", () => {
    expect(component()).toMatch(/scanNewTickets/);
    expect(component()).toMatch(/selectConfirmedOrderIds/);
  });

  it("decides and dedups through the shared modules", () => {
    const src = component();
    expect(src).toMatch(/selectOrdersToAutoPrint/);
    expect(src).toMatch(/recordPrinted/);
    expect(src).toMatch(/parsePrintedList/);
  });

  it("prints through the same receipt hook the Reprint button uses", () => {
    expect(component()).toMatch(/useOrderPrint/);
  });
});

describe("confirm surfaces defer to the watcher", () => {
  it("the order screen no longer prints on confirm itself", () => {
    const detail = read("app", "(main)", "order", "[orderId].tsx");
    expect(detail).not.toMatch(/shouldPrint\("confirmation"\)/);
  });

  it("the orders list no longer nags the cashier to open the order to print", () => {
    const list = read("app", "(main)", "orders.tsx");
    expect(list).not.toMatch(/Open the order to print its receipt/);
    expect(list).not.toMatch(/shouldPrint\("confirmation"\)/);
  });
});
