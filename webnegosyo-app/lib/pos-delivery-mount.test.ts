/**
 * Guardrails for manual delivery details on the register.
 *
 * Jest here only runs the pure-logic roots, so — like the other mount
 * guardrails in this package — this asserts on the sources rather than
 * rendering them. Each assertion corresponds to a way the feature can be
 * silently dead: a fee priced by the store but never enterable, entered but
 * never sent, or sent but never shown.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("the register screen", () => {
  const register = read("app", "(main)", "pos.tsx");

  it("mounts the delivery sheet and opens it from the cart", () => {
    expect(register).toMatch(/DeliverySheet/);
    expect(register).toMatch(/onEditDelivery/);
  });

  it("saves the sheet's details into the store", () => {
    expect(register).toMatch(/setDelivery/);
  });
});

describe("the cart sheet", () => {
  const sheet = read("components", "pos", "CartSheet.tsx");

  it("shows the fee as a totals row so the charge is explainable", () => {
    // A fee inside the total with no row is a bill that does not add up in
    // front of the customer.
    expect(sheet).toMatch(/totals\.deliveryFee > 0/);
    expect(sheet).toMatch(/Delivery/);
  });

  it("offers the entry point without requiring the cart to be expanded", () => {
    expect(sheet).toMatch(/onEditDelivery/);
  });
});

describe("the tender screen", () => {
  const tender = read("app", "(main)", "pos-tender.tsx");

  it("passes the delivery details into the order it builds", () => {
    // The exact failure customerContact had: `buildPosOrder` accepting a field
    // nothing ever passed. Read at tender time, like the discount lines.
    expect(tender).toMatch(/delivery: usePosCartStore\.getState\(\)\.delivery/);
  });
});

describe("the register's cart store", () => {
  const store = read("stores", "pos-cart-store.ts");

  it("clears the delivery details everywhere a sale ends", () => {
    // Initial state + reset + beginEdit + endEdit. A fee outliving its sale
    // is billed to the next stranger at the counter.
    const clears = store.match(/clearedSaleDelivery\(\)/g) ?? [];
    expect(clears.length).toBeGreaterThanOrEqual(4);
  });
});
