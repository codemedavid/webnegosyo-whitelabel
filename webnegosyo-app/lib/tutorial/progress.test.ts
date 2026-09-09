/**
 * Tutorial progress: pure arithmetic over which chapters a merchant finished.
 * These pin the hub's promises — the ring's percentage, "Continue" resuming
 * the right chapter, and the welcome greeter showing exactly once.
 */

import {
  EMPTY_PROGRESS,
  markChapterComplete,
  nextChapter,
  progressSummary,
  resetProgress,
  shouldShowTutorialWelcome,
  markWelcomeSeen,
  type TutorialProgress,
} from "./progress";

const CHAPTERS = ["basics", "orders", "register"];

describe("progressSummary", () => {
  it("reports zero of N with nothing done", () => {
    expect(progressSummary(EMPTY_PROGRESS, CHAPTERS)).toEqual({
      completed: 0,
      total: 3,
      fraction: 0,
      isComplete: false,
    });
  });

  it("only counts completions the account can still see", () => {
    const progress: TutorialProgress = {
      ...EMPTY_PROGRESS,
      completedChapterIds: ["orders", "branches"],
    };
    expect(progressSummary(progress, CHAPTERS)).toEqual({
      completed: 1,
      total: 3,
      fraction: 1 / 3,
      isComplete: false,
    });
  });

  it("is complete when every visible chapter is done", () => {
    const progress = markChapterComplete(
      markChapterComplete(markChapterComplete(EMPTY_PROGRESS, "basics"), "orders"),
      "register",
    );
    expect(progressSummary(progress, CHAPTERS).isComplete).toBe(true);
  });

  it("does not divide by zero for an account with no chapters", () => {
    expect(progressSummary(EMPTY_PROGRESS, []).fraction).toBe(0);
  });
});

describe("markChapterComplete", () => {
  it("returns a new object and never duplicates an id", () => {
    const once = markChapterComplete(EMPTY_PROGRESS, "orders");
    const twice = markChapterComplete(once, "orders");
    expect(once).not.toBe(EMPTY_PROGRESS);
    expect(twice.completedChapterIds).toEqual(["orders"]);
    expect(EMPTY_PROGRESS.completedChapterIds).toEqual([]);
  });

  it("remembers the chapter as the last one opened", () => {
    expect(markChapterComplete(EMPTY_PROGRESS, "orders").lastChapterId).toBe("orders");
  });
});

describe("nextChapter", () => {
  it("starts at the first chapter", () => {
    expect(nextChapter(EMPTY_PROGRESS, CHAPTERS)).toBe("basics");
  });

  it("resumes at the first unfinished chapter after the last one opened", () => {
    const progress = markChapterComplete(markChapterComplete(EMPTY_PROGRESS, "basics"), "orders");
    expect(nextChapter(progress, CHAPTERS)).toBe("register");
  });

  it("wraps to an earlier unfinished chapter when later ones are done", () => {
    const progress = markChapterComplete(EMPTY_PROGRESS, "register");
    expect(nextChapter(progress, CHAPTERS)).toBe("basics");
  });

  it("returns null when everything is finished", () => {
    const progress = CHAPTERS.reduce(markChapterComplete, EMPTY_PROGRESS);
    expect(nextChapter(progress, CHAPTERS)).toBeNull();
  });
});

describe("shouldShowTutorialWelcome", () => {
  const eligible = {
    isAuthenticated: true,
    isSuperadmin: false,
    impersonatedTenantId: null,
    progress: EMPTY_PROGRESS,
  };

  it("greets a signed-in merchant who has never seen it", () => {
    expect(shouldShowTutorialWelcome(eligible)).toBe(true);
  });

  it("is silent once seen, dismissed or started", () => {
    expect(shouldShowTutorialWelcome({ ...eligible, progress: markWelcomeSeen(EMPTY_PROGRESS) })).toBe(false);
    expect(
      shouldShowTutorialWelcome({ ...eligible, progress: markChapterComplete(EMPTY_PROGRESS, "basics") }),
    ).toBe(false);
  });

  it("never greets a superadmin, even while viewing a store", () => {
    expect(shouldShowTutorialWelcome({ ...eligible, isSuperadmin: true })).toBe(false);
    expect(
      shouldShowTutorialWelcome({ ...eligible, isSuperadmin: true, impersonatedTenantId: "t1" }),
    ).toBe(false);
  });

  it("waits for a session", () => {
    expect(shouldShowTutorialWelcome({ ...eligible, isAuthenticated: false })).toBe(false);
  });
});

describe("resetProgress", () => {
  it("forgets chapters but keeps the welcome dismissed", () => {
    const progress = markChapterComplete(markWelcomeSeen(EMPTY_PROGRESS), "orders");
    expect(resetProgress(progress)).toEqual({ ...EMPTY_PROGRESS, welcomeSeen: true });
  });
});
