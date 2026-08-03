/**
 * Guardrails for attaching a guest to a counter sale.
 *
 * Jest here only runs the pure-logic roots, so — like the other mount
 * guardrails in this package — this asserts on the sources rather than
 * rendering them. What it locks down is the wiring a unit test of the pure
 * modules cannot see, and every assertion below corresponds to a way this
 * feature can be silently dead or silently wrong.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("the tender screen", () => {
  const tender = read("app", "(main)", "pos-tender.tsx");

  it("passes the customer fields into the order it builds", () => {
    // `buildPosOrder` has accepted `customerContact` since it was written and
    // nothing ever passed it, so every counter sale went out anonymous. This
    // is the assertion that would have caught that.
    expect(tender).toMatch(/posCustomerFields\(attachedCustomer, customerName\)/);
  });

  it("derives the attachment fields from the shared pure rule", () => {
    // A screen that decided "phone or email?" beside the JSX would be a second
    // opinion on the question the resolver already answers.
    expect(tender).not.toMatch(/attachedCustomer\?\.phoneE164 \?\?/);
  });

  it("reports the captured sale to the platform", () => {
    // Without this the attachment is cosmetic: the guest is linked to an order
    // the profile system never hears about, so their totals never move.
    expect(tender).toMatch(/notifyCustomerCapture/);
  });

  it("opens a picker rather than relying on the free-text name box", () => {
    expect(tender).toMatch(/CustomerPickerSheet/);
    expect(tender).toMatch(/setAttachedCustomer/);
  });
});

describe("the register's cart store", () => {
  const store = read("stores", "pos-cart-store.ts");

  it("clears the guest everywhere a sale ends", () => {
    // The worst bug available here is an attachment outliving its sale, which
    // would credit the next stranger's order to a regular. reset, beginEdit
    // and endEdit must all wipe it — endEdit historically did not even clear
    // the typed name.
    const clears = store.match(/clearedSaleCustomer\(\)/g) ?? [];
    expect(clears.length).toBeGreaterThanOrEqual(4);
  });

  it("exposes a way to attach and to detach", () => {
    expect(store).toMatch(/setAttachedCustomer/);
  });
});

describe("the customer picker", () => {
  const sheet = read("components", "pos", "CustomerPickerSheet.tsx");

  it("offers an explicit walk-in, not just an escape hatch", () => {
    // An anonymous sale is the common case. A cashier must be able to say so
    // in one tap rather than by abandoning the sheet.
    expect(sheet).toMatch(/Walk-in/);
  });

  it("validates a quick-created guest before saving", () => {
    // The counter is exactly where "walk in" gets typed into a name box.
    expect(sheet).toMatch(/validateCustomerDraft/);
    expect(sheet).toMatch(/draftFromSearch/);
  });

  it("tells the cashier when the guest already exists", () => {
    expect(sheet).toMatch(/DuplicateCustomerError/);
  });

  it("does not claim the store is empty when the search failed", () => {
    expect(sheet).toMatch(/Could not search customers/);
  });
});
