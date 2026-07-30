// Guardrail: the branch filter must be applied where the query is BUILT, not
// where its results are drawn.
//
// Every order surface already narrows its own render through `useBranchScope`,
// so a branch manager never SAW another branch's orders — but the rows still
// arrived on their device, customer names and phone numbers included. Closing
// that means `lib/hooks.ts`, the single dispatch point, has to hand the scope to
// the adapter. Jest only runs pure-logic roots here, so this asserts on the
// source of the hook module the same way `business-screen-mount` asserts on
// screens.
import { readFileSync } from "fs";
import { join } from "path";

const HOOKS = () => readFileSync(join(__dirname, "hooks.ts"), "utf8");

describe("platform read scoping", () => {
  it("resolves the account's branch scope in the dispatch hook", () => {
    // The account scope — not the branch an owner has drilled into. See below.
    expect(HOOKS()).toMatch(/useAccountBranchScope/);
  });

  it("does not narrow queries by the branch being viewed", () => {
    // `useBranchScope` is already narrowed to the drill-down. Fetching through
    // it would leave the portfolio and the Branches comparison unable to read
    // the branches they exist to compare — the same collapse
    // `business-screen-mount` pins on the screens, one layer down. An owner is
    // entitled to the whole store anyway, so pushing their selection to the
    // server buys no safety.
    expect(HOOKS()).not.toMatch(/\buseBranchScope\b/);
  });

  it("passes the scope into the platform query", () => {
    expect(HOOKS()).toMatch(/runPlatformQuery\([\s\S]{0,200}scope/);
  });

  it("re-checks the branch on an incoming realtime payload", () => {
    // One filter clause per binding is all Realtime allows, and it is spent on
    // the tenant. Without this check a manager's screen refetches — and the
    // new-order chime fires — for a sale at another branch.
    expect(HOOKS()).toMatch(/isOrderChangeInScope/);
  });

  it("re-reads when the account's branch changes", () => {
    // The scope is part of what the query asked for. Left out of the effect's
    // dependencies, a session that resolves its branch after the first fetch
    // would keep showing the unscoped result until the next poll.
    expect(HOOKS()).toMatch(/\[[^\]]*scopeKey[^\]]*\]/);
  });
});
