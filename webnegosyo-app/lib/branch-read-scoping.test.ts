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

// The platform read path itself lives in a leaf module so it can be exercised
// with renderHook; the scope-threading guarantees moved with it.
const PLATFORM_QUERY = () =>
  readFileSync(join(__dirname, "backends", "use-platform-query.ts"), "utf8");

// Where a realtime payload is turned into per-key refetches.
const QUERY_INVALIDATION = () =>
  readFileSync(join(__dirname, "backends", "query-invalidation.ts"), "utf8");

describe("platform read scoping", () => {
  it("resolves the account's branch scope in the dispatch hook", () => {
    // The account scope — not the branch an owner has drilled into. See below.
    expect(HOOKS()).toMatch(/useAccountBranchScope/);
  });

  it("passes the scope into the platform query", () => {
    expect(PLATFORM_QUERY()).toMatch(/runPlatformQuery\([\s\S]{0,200}scope/);
  });

  it("re-checks the branch on an incoming realtime payload", () => {
    // One filter clause per binding is all Realtime allows, and it is spent on
    // the tenant. Without this check a manager's screen refetches — and the
    // new-order chime fires — for a sale at another branch.
    //
    // With one channel per tenant, the check moved from the channel callback
    // to the per-key invalidation predicate; the hook documents where.
    expect(PLATFORM_QUERY()).toMatch(/isOrderChangeInScope/);
    expect(QUERY_INVALIDATION()).toMatch(
      /isQueryAffectedByOrderChange[\s\S]*isOrderChangeInScope\(payload, tenantId, platformKeyScope\(key\)\)/
    );
  });

  it("re-reads when the account's branch changes", () => {
    // The scope is part of what the query asked for. Left out of the effect's
    // dependencies, a session that resolves its branch after the first fetch
    // would keep showing the unscoped result until the next poll.
    expect(PLATFORM_QUERY()).toMatch(/\[[^\]]*scopeKey[^\]]*\]/);
  });
});
