// Guardrails for "I don't see an option to reprint the invoice".
//
// The Reprint button sat inside the order screen's status-actions block, which
// is not rendered on a delivered order — every finished sale. These pins read
// the screen source (jest runs pure-logic roots only): the print actions live
// OUTSIDE that block, the block itself still hides Edit/Cancel/status moves on
// delivered orders, and only manual reprints are marked REPRINT.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const read = (...segments: string[]) => readFileSync(join(ROOT, ...segments), "utf8");

const screen = () => read("app", "(main)", "order", "[orderId].tsx");
const ACTIONS_GATE = '{(nextStatus || (order.status !== "delivered" && order.status !== "cancelled")) && (';

function actionsBlock(src: string): string {
  const start = src.indexOf(ACTIONS_GATE);
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf("</ScrollView>", start));
}

describe("order screen: Reprint on delivered orders", () => {
  it("renders the print actions, gated by reprintGate, above and outside the status actions", () => {
    const src = screen();
    const printAt = src.indexOf("<OrderPrintActions");
    expect(printAt).toBeGreaterThan(-1);
    expect(printAt).toBeLessThan(src.indexOf(ACTIONS_GATE));
    expect(src).toMatch(/reprintGate\(order, printers\)/);
    expect(actionsBlock(src)).not.toMatch(/ReprintButton|OrderPrintActions/);
  });

  it("still keeps Edit, Add items, the status move and Cancel inside the block a delivered order skips", () => {
    const block = actionsBlock(screen());
    expect(block).toMatch(/Edit in register/);
    expect(block).toMatch(/Add items to this order/);
    expect(block).toMatch(/NEXT_ACTION_LABEL\[nextStatus\]/);
    expect(block).toMatch(/Cancel Order/);
  });

  it("has no next status after delivered, so that block stays hidden on a finished sale", () => {
    const src = screen();
    const start = src.indexOf("const NEXT_STATUS");
    const table = src.slice(start, src.indexOf("};", start));
    expect(table).toMatch(/ready: "delivered"/);
    expect(table).not.toMatch(/\bdelivered:/);
  });

  it("reprints through the marking hook, and offers the kitchen chit only behind its gate", () => {
    const src = screen();
    expect(src).toMatch(/useReceiptReprint\(\)/);
    expect(src).toMatch(/kitchenChitGate\(order, printers\)/);
    expect(src).toMatch(/manualChitOptions\(/);
  });

  it("handles the Drawer's ?intent=reprint once the ledger has loaded", () => {
    const src = screen();
    expect(src).toMatch(/"reprint"/);
    expect(src).toMatch(/isLedgerSettled/);
  });
});

describe("only a manual reprint is marked", () => {
  it("the reprint hook marks the copy and reports it after the paper is out", () => {
    const hook = read("hooks", "useReceiptReprint.ts");
    expect(hook).toMatch(/markReprint\(order, Date\.now\(\)\)/);
    expect(hook).toMatch(/if \(isPrinted && !isDemo\)/);
    expect(hook).toMatch(/void reportReceiptReprint\(/);
  });

  it.each([
    ["components", "GlobalReceiptAutoPrint.tsx"],
    ["app", "(main)", "pos-tender.tsx"],
    ["hooks", "useOrderPrint.ts"],
  ])("%s/%s never marks a print", (...segments) => {
    const src = read(...segments);
    expect(src).not.toMatch(/markReprint|reprint:\s*\{/);
  });

  it("auto-print never marks a kitchen chit", () => {
    expect(read("components", "GlobalKitchenAutoPrint.tsx")).not.toMatch(/reprintAt|manualChitOptions/);
    expect(read("lib", "pos-kitchen-print.ts")).not.toMatch(/reprintAt|manualChitOptions/);
  });
});
