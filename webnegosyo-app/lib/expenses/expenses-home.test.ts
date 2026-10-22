import {
  changeText,
  comparisonFor,
  hasHomeParams,
  heroEyebrow,
  homeStateForLink,
  homeSubtitle,
  isInRange,
  monthsCovering,
  parseHomeParams,
  rangeLabel,
  windowMonth,
  windowRange,
} from "./expenses-home";

const NOW = Date.parse("2026-10-22T04:00:00Z"); // Thu 22 Oct 2026, 12:00 PM in Manila

describe("parseHomeParams", () => {
  test("returns nothing to do when no params are given", () => {
    // Arrange
    const raw = {};

    // Act
    const parsed = parseHomeParams(raw, NOW);

    // Assert
    expect(parsed).toEqual({ month: null, range: null, view: null, categoryId: null, isAdd: false, isSort: false });
    expect(hasHomeParams(raw)).toBe(false);
  });

  test("reads a month, a view and a category", () => {
    const parsed = parseHomeParams({ month: "2026-09", view: "no_receipt", category: "cat-1" }, NOW);

    expect(parsed.month).toBe("2026-09");
    expect(parsed.view).toBe("no_receipt");
    expect(parsed.categoryId).toBe("cat-1");
  });

  test("treats view=unsorted as opening the sort sheet, not as a filter", () => {
    const parsed = parseHomeParams({ view: "unsorted" }, NOW);

    expect(parsed.isSort).toBe(true);
    expect(parsed.view).toBeNull();
  });

  test("ignores a month in the future and a malformed month", () => {
    expect(parseHomeParams({ month: "2026-11" }, NOW).month).toBeNull();
    expect(parseHomeParams({ month: "2026-13" }, NOW).month).toBeNull();
    expect(parseHomeParams({ month: "October" }, NOW).month).toBeNull();
  });

  test("ignores an unknown view", () => {
    expect(parseHomeParams({ view: "everything" }, NOW).view).toBeNull();
  });

  test("reads an exact from/to range", () => {
    const parsed = parseHomeParams({ from: "2026-10-20", to: "2026-10-26" }, NOW);

    expect(parsed.range).toEqual({ from: "2026-10-20", to: "2026-10-26" });
  });

  test("puts a backwards range the right way round", () => {
    const parsed = parseHomeParams({ from: "2026-10-26", to: "2026-10-20" }, NOW);

    expect(parsed.range).toEqual({ from: "2026-10-20", to: "2026-10-26" });
  });

  test("uses one day when only one end is given", () => {
    expect(parseHomeParams({ from: "2026-10-03" }, NOW).range).toEqual({ from: "2026-10-03", to: "2026-10-03" });
    expect(parseHomeParams({ to: "2026-10-03" }, NOW).range).toEqual({ from: "2026-10-03", to: "2026-10-03" });
  });

  test("refuses a date that does not exist", () => {
    expect(parseHomeParams({ from: "2026-02-30", to: "2026-03-02" }, NOW).range).toBeNull();
  });

  test("caps a long range at 93 days from its first day", () => {
    const parsed = parseHomeParams({ from: "2026-01-01", to: "2026-10-01" }, NOW);

    expect(parsed.range).toEqual({ from: "2026-01-01", to: "2026-04-03" });
  });

  test("shows a range that is a whole month as that month", () => {
    const parsed = parseHomeParams({ from: "2026-09-01", to: "2026-09-30" }, NOW);

    expect(parsed.range).toBeNull();
    expect(parsed.month).toBe("2026-09");
  });

  test("shows this month so far as the month", () => {
    const parsed = parseHomeParams({ from: "2026-10-01", to: "2026-10-22" }, NOW);

    expect(parsed.range).toBeNull();
    expect(parsed.month).toBe("2026-10");
  });

  test("keeps part of a past month as a range", () => {
    expect(parseHomeParams({ from: "2026-09-01", to: "2026-09-22" }, NOW).range).toEqual({ from: "2026-09-01", to: "2026-09-22" });
  });

  test("reads add=1 and keeps the category for the sheet", () => {
    const parsed = parseHomeParams({ add: "1", category: "rent" }, NOW);

    expect(parsed.isAdd).toBe(true);
    expect(parsed.categoryId).toBe("rent");
  });

  test("takes the first value when a param is repeated", () => {
    expect(parseHomeParams({ view: ["drawer", "check"] }, NOW).view).toBe("drawer");
  });
});

describe("monthsCovering", () => {
  test("lists one month for a range inside a month", () => {
    expect(monthsCovering({ from: "2026-10-20", to: "2026-10-26" })).toEqual(["2026-10"]);
  });

  test("lists every month a range touches, across a year end", () => {
    expect(monthsCovering({ from: "2025-12-28", to: "2026-02-03" })).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  test("never lists more than four months", () => {
    expect(monthsCovering({ from: "2026-01-01", to: "2026-12-31" })).toHaveLength(4);
  });
});

describe("window", () => {
  test("a month window runs from its first to its last day", () => {
    expect(windowRange("2026-09", null)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  test("a range window is the range itself", () => {
    expect(windowRange("2026-09", { from: "2026-10-20", to: "2026-10-26" })).toEqual({ from: "2026-10-20", to: "2026-10-26" });
  });

  test("the month a range belongs to is its last day's month", () => {
    expect(windowMonth("2026-01", { from: "2026-09-28", to: "2026-10-04" })).toBe("2026-10");
    expect(windowMonth("2026-01", null)).toBe("2026-01");
  });

  test("isInRange includes both ends", () => {
    const range = { from: "2026-10-20", to: "2026-10-26" };
    expect(isInRange("2026-10-20", range)).toBe(true);
    expect(isInRange("2026-10-26", range)).toBe(true);
    expect(isInRange("2026-10-27", range)).toBe(false);
  });
});

describe("labels", () => {
  test("a range inside one month reads as day–day month", () => {
    expect(rangeLabel({ from: "2026-10-20", to: "2026-10-26" }, NOW)).toBe("20–26 Oct");
  });

  test("a range across months names both months", () => {
    expect(rangeLabel({ from: "2026-09-28", to: "2026-10-04" }, NOW)).toBe("28 Sep – 4 Oct");
  });

  test("a single day reads as one date", () => {
    expect(rangeLabel({ from: "2026-10-03", to: "2026-10-03" }, NOW)).toBe("3 Oct");
  });

  test("a range from another year says the year", () => {
    expect(rangeLabel({ from: "2025-12-28", to: "2026-01-03" }, NOW)).toBe("28 Dec 2025 – 3 Jan");
  });

  test("the subtitle names the month and the branch", () => {
    expect(homeSubtitle({ month: "2026-10", range: null, branchLabel: "All branches" }, NOW)).toBe("October · All branches");
    expect(homeSubtitle({ month: "2026-10", range: null, branchLabel: null }, NOW)).toBe("October");
  });

  test("the subtitle names the range when there is one", () => {
    expect(homeSubtitle({ month: "2026-10", range: { from: "2026-10-20", to: "2026-10-26" }, branchLabel: "Main" }, NOW)).toBe(
      "20–26 Oct · Main",
    );
  });

  test("the hero eyebrow says where the money went and whether it is filtered", () => {
    expect(heroEyebrow({ month: "2026-10", range: null, isFiltered: false }, NOW)).toBe("Spent in October");
    expect(heroEyebrow({ month: "2025-10", range: null, isFiltered: false }, NOW)).toBe("Spent in October 2025");
    expect(heroEyebrow({ month: "2026-10", range: null, isFiltered: true }, NOW)).toBe("Spent in October · filtered");
    expect(heroEyebrow({ month: "2026-10", range: { from: "2026-10-20", to: "2026-10-26" }, isFiltered: false }, NOW)).toBe(
      "Spent 20–26 Oct",
    );
  });
});

describe("comparisonFor", () => {
  test("compares this month so far with the same days of last month", () => {
    expect(comparisonFor("2026-10", NOW)).toEqual({ previousMonth: "2026-09", throughDay: "2026-09-22", label: "1–22 Sep" });
  });

  test("clamps the same-days window to a shorter previous month", () => {
    const march31 = Date.parse("2026-03-31T04:00:00Z");

    expect(comparisonFor("2026-03", march31)).toEqual({ previousMonth: "2026-02", throughDay: "2026-02-28", label: "1–28 Feb" });
  });

  test("compares a finished month with the whole month before", () => {
    expect(comparisonFor("2026-08", NOW)).toEqual({ previousMonth: "2026-07", throughDay: null, label: "Jul" });
  });

  test("words the change without colour or arrows", () => {
    expect(changeText({ direction: "up", percent: 9 }, "Sep")).toBe("Up 9% vs Sep");
    expect(changeText({ direction: "down", percent: 12 }, "1–22 Sep")).toBe("Down 12% vs 1–22 Sep");
    expect(changeText({ direction: "same", percent: 0 }, "Sep")).toBe("Same as Sep");
    expect(changeText(null, "Sep")).toBeNull();
  });
});

describe("homeStateForLink", () => {
  test("a view link starts from a clean slate: this month, no category, no range", () => {
    // Arrange
    const asked = parseHomeParams({ view: "drawer" }, NOW);

    // Act
    const state = homeStateForLink(asked, NOW);

    // Assert
    expect(state).toEqual({ month: "2026-10", range: null, view: "drawer", categoryId: null, opens: null, addCategoryId: null });
  });

  test("a category link clears any view that was on before", () => {
    const state = homeStateForLink(parseHomeParams({ category: "ice", month: "2026-09" }, NOW), NOW);

    expect(state).toMatchObject({ month: "2026-09", range: null, view: "all", categoryId: "ice", opens: null });
  });

  test("a range link shows the range and steps from its last month", () => {
    const state = homeStateForLink(parseHomeParams({ from: "2026-09-28", to: "2026-10-04" }, NOW), NOW);

    expect(state.range).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(state.month).toBe("2026-10");
    expect(state.view).toBe("all");
  });

  test("add=1 opens the sheet with its category, without filtering the list by it", () => {
    const state = homeStateForLink(parseHomeParams({ add: "1", category: "rent" }, NOW), NOW);

    expect(state).toMatchObject({ view: "all", categoryId: null, opens: "add", addCategoryId: "rent", month: "2026-10" });
  });

  test("view=unsorted opens the sort sheet on a clean list", () => {
    const state = homeStateForLink(parseHomeParams({ view: "unsorted" }, NOW), NOW);

    expect(state).toMatchObject({ view: "all", categoryId: null, opens: "sort" });
  });
});
