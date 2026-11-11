import { readFileSync } from "fs";
import { join } from "path";
import { reprintOrderHref } from "./reprint-route";

describe("reprintOrderHref", () => {
  it("opens the order screen with the reprint intent", () => {
    expect(reprintOrderHref("abc-123")).toBe("/(main)/order/abc-123?intent=reprint");
  });

  it("keeps an odd id inside its path segment", () => {
    expect(reprintOrderHref("a/b?c")).toBe("/(main)/order/a%2Fb%3Fc?intent=reprint");
  });
});

describe("the Drawer's recent sales offer Reprint", () => {
  const drawer = readFileSync(join(__dirname, "..", "app", "(main)", "pos-sales.tsx"), "utf8");

  it("shows it on a sale row only where a receipt printer is saved", () => {
    expect(drawer).toMatch(/reprintGate\(\{ status: sale\.status \?\? "confirmed" \}, printers\)\.enabled/);
  });

  it("uses the shared Button and lands on the order's reprint intent", () => {
    expect(drawer).toMatch(/<Button\s+label="Reprint"/);
    expect(drawer).toMatch(/reprintOrderHref\(sale\._id\)/);
  });
});
