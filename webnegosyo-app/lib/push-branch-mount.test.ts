/**
 * Guardrails for branch-targeted push wiring.
 *
 * Jest here only runs pure-logic roots (lib/, theme/), so — like the other
 * mount guardrails in this directory — this asserts on the sources rather than
 * rendering them. The pure rules are covered by `push-registration.test.ts` and
 * `convex-template/convex/pushRecipients.test.ts`; what a unit test cannot see
 * is whether anything actually *calls* them. Both halves have to be wired or
 * the feature silently reverts to ringing every branch, which looks exactly
 * like today's behaviour and so would not be noticed.
 */
import { readFileSync } from "fs";
import { join } from "path";

const APP_ROOT = join(__dirname, "..");
const CONVEX_ROOT = join(__dirname, "..", "..", "convex-template", "convex");

function read(root: string, ...segments: string[]): string {
  return readFileSync(join(root, ...segments), "utf8");
}

describe("device registration", () => {
  const layout = read(APP_ROOT, "app", "_layout.tsx");

  it("registers the device under its branch", () => {
    // Without this argument the token is stored store-wide and the phone keeps
    // hearing every branch — the exact bug this change exists to fix.
    expect(layout).toMatch(/outletId:\s*pushRegistrationOutletId\(session\)/);
  });

  it("takes the branch from the account, not a viewed selection", () => {
    // A token outlives the screen that wrote it. `useBranchScope` (the owner's
    // drill-down) must never be the source here, or backing out of a branch
    // would leave the owner deaf to the others.
    expect(layout).not.toMatch(/useBranchScope/);
  });
});

describe("notification fan-out", () => {
  const notifications = read(CONVEX_ROOT, "notifications.ts");
  const orders = read(CONVEX_ROOT, "orders.ts");

  it("narrows recipients to the order's branch before pushing", () => {
    expect(notifications).toMatch(/recipientsForOutlet\(/);
  });

  it("does not push to the unfiltered token list", () => {
    // `getAllTokens` must be read *through* the filter. Mapping it straight
    // into the Expo payload is the regression to catch.
    expect(notifications).not.toMatch(/const messages = allTokens\.map/);
  });

  it("passes the new order's branch to the notification", () => {
    // The branch rides in `customerData`, so the trigger site has to extract it.
    expect(orders).toMatch(/orderOutletIdFromCustomerData\(args\.customerData\)/);
  });

  it("stores the branch on the token so the filter has something to match", () => {
    expect(read(CONVEX_ROOT, "schema.ts")).toMatch(
      /pushTokens: defineTable\(\{[\s\S]*?outletId: v\.optional\(v\.string\(\)\)/
    );
  });
});
