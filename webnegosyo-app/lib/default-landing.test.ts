import { resolveLanding } from "./default-landing";
import type { BranchScope } from "./branch-scope";
import type { StaffPermissionHolder } from "./staff-permissions";

/**
 * Where a session actually opens, once the owner is allowed to choose.
 *
 * The rule this file pins is the one a merchant feels every single launch, so
 * it is written from its negative cases first: an account with no chosen
 * screen, a chosen screen that no longer exists, and a chosen screen the staff
 * may no longer open all have to land exactly where the app landed before any
 * of this was configurable. A default screen is a convenience; losing the app
 * to a blank tab bar because one was set months ago is not a trade worth
 * making.
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

describe("resolveLanding — no default chosen", () => {
  it("leaves a single-location owner on the screen the app already opens", () => {
    const landing = resolveLanding({
      defaultTab: null,
      user: OWNER,
      audience: SINGLE_BRANCH,
    });

    expect(landing).toEqual({ workspace: "operations", href: null });
  });

  it("still opens a multi-branch owner on the portfolio", () => {
    // The automatic rule is unchanged for everyone who never set a screen.
    const landing = resolveLanding({
      defaultTab: null,
      user: OWNER,
      audience: MULTI_BRANCH,
    });

    expect(landing).toEqual({ workspace: "business", href: "/(main)/portfolio" });
  });

  it("treats an absent value the same as an explicit null", () => {
    expect(resolveLanding({ defaultTab: undefined, user: OWNER, audience: MULTI_BRANCH })).toEqual(
      resolveLanding({ defaultTab: null, user: OWNER, audience: MULTI_BRANCH }),
    );
  });

  it("treats a blank string as no choice at all", () => {
    // An empty text column is what a cleared radio group writes.
    expect(resolveLanding({ defaultTab: "   ", user: OWNER, audience: SINGLE_BRANCH })).toEqual({
      workspace: "operations",
      href: null,
    });
  });
});

describe("resolveLanding — a screen was chosen", () => {
  it("opens a cashier on the register", () => {
    const landing = resolveLanding({
      defaultTab: "pos",
      user: staffWith("pos"),
      audience: SINGLE_BRANCH,
    });

    expect(landing).toEqual({ workspace: "register", href: "/(main)/pos" });
  });

  it("switches to the view that owns the chosen screen, so its tabs are the ones shown", () => {
    const landing = resolveLanding({
      defaultTab: "inventory",
      user: staffWith("menu"),
      audience: SINGLE_BRANCH,
    });

    expect(landing.workspace).toBe("products");
  });

  it("navigates nowhere when the chosen screen is already the one the app opens on", () => {
    // A redirect to the screen you are standing on is a wasted frame at best,
    // and a remount of the tab navigator at worst.
    expect(
      resolveLanding({ defaultTab: "dashboard", user: OWNER, audience: SINGLE_BRANCH }),
    ).toEqual({ workspace: "operations", href: null });
  });

  it("beats the automatic portfolio rule for a multi-branch owner", () => {
    // The owner picked this screen on purpose; the branch-count heuristic is a
    // guess at the same question and must lose to a stated answer.
    const landing = resolveLanding({
      defaultTab: "orders",
      user: OWNER,
      audience: MULTI_BRANCH,
    });

    expect(landing).toEqual({ workspace: "operations", href: "/(main)/orders" });
  });

  it("honours a portfolio default for an owner who runs several branches", () => {
    expect(
      resolveLanding({ defaultTab: "branches", user: OWNER, audience: MULTI_BRANCH }),
    ).toEqual({ workspace: "business", href: "/(main)/branches" });
  });
});

describe("resolveLanding — the choice is no longer usable", () => {
  it("falls back when the staff member lacks the permission the screen needs", () => {
    // The grant was revoked after the screen was chosen. Landing there anyway
    // means an account staring at a tab bar with nothing on it.
    const landing = resolveLanding({
      defaultTab: "analytics",
      user: staffWith("pos"),
      audience: SINGLE_BRANCH,
    });

    expect(landing).toEqual({ workspace: "operations", href: null });
  });

  it("falls back when a business screen is chosen but the store has one branch", () => {
    // A store can drop back to a single location long after the choice.
    const landing = resolveLanding({
      defaultTab: "portfolio",
      user: OWNER,
      audience: SINGLE_BRANCH,
    });

    expect(landing).toEqual({ workspace: "operations", href: null });
  });

  it("falls back when a branch manager was given a store-wide business screen", () => {
    const landing = resolveLanding({
      defaultTab: "portfolio",
      user: OWNER,
      audience: { accountScope: NORTH, activeOutletCount: 4 },
    });

    expect(landing).toEqual({ workspace: "operations", href: null });
  });

  it("falls back on a screen name the app no longer has", () => {
    // Renaming or retiring a route must not strand the accounts pointed at it.
    expect(
      resolveLanding({ defaultTab: "reports-v1", user: OWNER, audience: SINGLE_BRANCH }),
    ).toEqual({ workspace: "operations", href: null });
  });

  it("refuses a value that is not a screen name at all", () => {
    // The column is free text, so anything can arrive here.
    expect(
      resolveLanding({
        defaultTab: "../../(auth)/login" as string,
        user: OWNER,
        audience: SINGLE_BRANCH,
      }),
    ).toEqual({ workspace: "operations", href: null });
  });

  it("keeps the automatic portfolio landing when an unusable choice falls back", () => {
    // Falling back means "as if nothing was chosen", not "operations always".
    const landing = resolveLanding({
      defaultTab: "not-a-screen",
      user: OWNER,
      audience: MULTI_BRANCH,
    });

    expect(landing).toEqual({ workspace: "business", href: "/(main)/portfolio" });
  });

  it("ignores a chosen screen during the demo tour", () => {
    // Demo sessions carry no staff row, but the guard is cheap and the tour is
    // scripted around the screen it opens on.
    const landing = resolveLanding({
      defaultTab: "pos",
      user: OWNER,
      audience: { ...SINGLE_BRANCH, isDemo: true },
      isDemo: true,
    });

    expect(landing).toEqual({ workspace: "operations", href: null });
  });
});
