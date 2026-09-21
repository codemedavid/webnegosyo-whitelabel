/**
 * Which chapters an account is offered. A chapter teaches a screen, so it is
 * shown exactly when the screen is reachable — a cashier is never taught the
 * Team screen, and a single-location store is never taught branch compare.
 */

import { visibleChapters } from "./visibility";
import type { TutorialChapter } from "./chapters";
import type { TabVisibilityContext } from "../tab-visibility";

const chapter = (id: string, gateTab: string | null, ownersOnly = false): TutorialChapter => ({
  id,
  title: id,
  tagline: "",
  icon: "info",
  gateTab,
  ownersOnly,
  minutes: 1,
  steps: [],
  destination: null,
});

const CHAPTERS = [
  chapter("basics", null),
  chapter("orders", "orders"),
  chapter("register", "pos"),
  chapter("branches", "branches"),
  chapter("team", null, true),
];

const owner = (overrides: Partial<TabVisibilityContext> = {}): TabVisibilityContext => ({
  caller: { role: "admin", isOwner: true, permissions: null },
  audience: { accountScope: { kind: "all" }, activeOutletCount: 1, isDemo: false },
  takesAdvanceOrders: false,
  ...overrides,
});

describe("visibleChapters", () => {
  it("offers a single-location owner everything but the branch chapter", () => {
    const ids = visibleChapters(CHAPTERS, owner(), { isOwner: true, isDemo: false }).map((c) => c.id);
    expect(ids).toEqual(["basics", "orders", "register", "team"]);
  });

  it("adds the branch chapter for a store that runs several", () => {
    const ctx = owner({
      audience: { accountScope: { kind: "all" }, activeOutletCount: 3, isDemo: false },
    });
    const ids = visibleChapters(CHAPTERS, ctx, { isOwner: true, isDemo: false }).map((c) => c.id);
    expect(ids).toContain("branches");
  });

  it("teaches restricted staff only the screens they hold", () => {
    const ctx = owner({ caller: { role: "staff", isOwner: false, permissions: ["orders"] } });
    const ids = visibleChapters(CHAPTERS, ctx, { isOwner: false, isDemo: false }).map((c) => c.id);
    expect(ids).toEqual(["basics", "orders"]);
  });

  it("keeps owner-only chapters from staff who otherwise see everything", () => {
    const ctx = owner({ caller: { role: "admin", isOwner: false, permissions: null } });
    const ids = visibleChapters(CHAPTERS, ctx, { isOwner: false, isDemo: false }).map((c) => c.id);
    expect(ids).not.toContain("team");
  });

  it("shows the demo store the full owner tour", () => {
    const ctx = owner({
      caller: { role: null, isOwner: false, permissions: null },
      audience: { accountScope: { kind: "all" }, activeOutletCount: 1, isDemo: true },
    });
    const ids = visibleChapters(CHAPTERS, ctx, { isOwner: false, isDemo: true }).map((c) => c.id);
    expect(ids).toContain("team");
  });
});
