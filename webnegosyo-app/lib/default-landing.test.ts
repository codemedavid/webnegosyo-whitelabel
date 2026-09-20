import { resolveLanding } from "./default-landing";
import type { BranchScope } from "./branch-scope";
import type { StaffPermissionHolder } from "./staff-permissions";

/**
 * Where a session actually opens, once the owner is allowed to choose.
 *
 * The rule this file pins is the one a merchant feels every single launch, so
 * it is written from its negative cases first: an account with no chosen
 * screen, a chosen screen that no longer exists, and a chosen screen the staff
 * may no longer open all have to land on Home. A default screen is a
 * convenience; losing the app to a screen that refuses you because one was
 * set months ago is not a trade worth making.
 */

const ALL: BranchScope = { kind: "all" };
const NORTH: BranchScope = { kind: "branch", outletId: "outlet-north" };

const OWNER: StaffPermissionHolder = { role: "admin", isOwner: true, permissions: null };

/** A staff account holding exactly the listed grants and nothing else. */
function staffWith(...permissions: string[]): StaffPermissionHolder {
  return { role: "admin", isOwner: false, permissions };
}

/** A single-location store — the shape most merchants run. */
const SINGLE_BRANCH = { accountScope: ALL, activeOutletCount: 1 };
/** A store with enough branches for the portfolio to exist. */
const MULTI_BRANCH = { accountScope: ALL, activeOutletCount: 3 };

/** Home: the app already opens here, so there is nowhere to go. */
const HOME = { href: null };

describe("resolveLanding — no default chosen", () => {
  it("leaves a single-location owner on Home", () => {
    expect(resolveLanding({ defaultTab: null, user: OWNER, audience: SINGLE_BRANCH })).toEqual(HOME);
  });

  it("leaves a multi-branch owner on Home too", () => {
    // Home carries a Branches section for them; the portfolio is one tap away
    // rather than the first screen, so the app opens the same way for everyone.
    expect(resolveLanding({ defaultTab: null, user: OWNER, audience: MULTI_BRANCH })).toEqual(HOME);
  });

  it("treats an absent value the same as an explicit null", () => {
    expect(resolveLanding({ defaultTab: undefined, user: OWNER, audience: MULTI_BRANCH })).toEqual(
      resolveLanding({ defaultTab: null, user: OWNER, audience: MULTI_BRANCH }),
    );
  });

  it("treats a blank string as no choice at all", () => {
    expect(resolveLanding({ defaultTab: "   ", user: OWNER, audience: MULTI_BRANCH })).toEqual(HOME);
  });
});

describe("resolveLanding — a screen was chosen", () => {
  it("opens the chosen screen", () => {
    expect(resolveLanding({ defaultTab: "pos", user: OWNER, audience: SINGLE_BRANCH })).toEqual({
      href: "/(main)/pos",
    });
  });

  it("trims whitespace around the stored value", () => {
    expect(resolveLanding({ defaultTab: " orders ", user: OWNER, audience: SINGLE_BRANCH })).toEqual({
      href: "/(main)/orders",
    });
  });

  it("stays put when Home itself was chosen", () => {
    // Redirecting onto the screen you are standing on remounts the navigator.
    expect(resolveLanding({ defaultTab: "dashboard", user: OWNER, audience: SINGLE_BRANCH })).toEqual(
      HOME,
    );
  });

  it("opens a Business screen for a multi-branch owner", () => {
    expect(resolveLanding({ defaultTab: "portfolio", user: OWNER, audience: MULTI_BRANCH })).toEqual({
      href: "/(main)/portfolio",
    });
  });
});

describe("resolveLanding — the choice is no longer usable", () => {
  it("falls back to Home for a screen that does not exist", () => {
    expect(resolveLanding({ defaultTab: "reports-v2", user: OWNER, audience: SINGLE_BRANCH })).toEqual(
      HOME,
    );
  });

  it("falls back to Home for a detail screen, which is not a place to land", () => {
    expect(resolveLanding({ defaultTab: "account", user: OWNER, audience: SINGLE_BRANCH })).toEqual(
      HOME,
    );
  });

  it("falls back to Home when the grant behind the screen was revoked", () => {
    expect(
      resolveLanding({ defaultTab: "analytics", user: staffWith("pos"), audience: SINGLE_BRANCH }),
    ).toEqual(HOME);
  });

  it("falls back to Home for a Business screen once the store has one branch", () => {
    expect(resolveLanding({ defaultTab: "portfolio", user: OWNER, audience: SINGLE_BRANCH })).toEqual(
      HOME,
    );
  });

  it("falls back to Home for a Business screen chosen for a branch manager", () => {
    expect(
      resolveLanding({
        defaultTab: "branches",
        user: OWNER,
        audience: { accountScope: NORTH, activeOutletCount: 3 },
      }),
    ).toEqual(HOME);
  });

  it("ignores any choice during the demo tour", () => {
    expect(
      resolveLanding({
        defaultTab: "pos",
        user: OWNER,
        audience: { ...MULTI_BRANCH, isDemo: true },
      }),
    ).toEqual(HOME);
    expect(
      resolveLanding({ defaultTab: "pos", user: OWNER, audience: MULTI_BRANCH, isDemo: true }),
    ).toEqual(HOME);
  });
});
