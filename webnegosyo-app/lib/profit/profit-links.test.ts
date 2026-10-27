import { expensesHref, findingHref, readRange } from "./profit-links";
import { resolveProfitWindow } from "./profit-period";

// Wed 2026-10-22 10:00 Manila.
const NOW = Date.parse("2026-10-22T02:00:00.000Z");

describe("drill-downs keep the exact dates", () => {
  it("reads a running month up to today, a finished one to its last day", () => {
    expect(readRange(resolveProfitWindow({ preset: "this_month" }, NOW))).toEqual({ fromKey: "2026-10-01", toKey: "2026-10-22" });
    expect(readRange(resolveProfitWindow({ preset: "last_month" }, NOW))).toEqual({ fromKey: "2026-09-01", toKey: "2026-09-30" });
    expect(readRange(resolveProfitWindow({ preset: "this_week" }, NOW))).toEqual({ fromKey: "2026-10-19", toKey: "2026-10-22" });
    expect(readRange(resolveProfitWindow({ preset: "custom", fromKey: "2026-08-01", toKey: "2026-08-15" }, NOW))).toEqual({
      fromKey: "2026-08-01",
      toKey: "2026-08-15",
    });
  });

  it("reads the first day when the window has only just begun", () => {
    const midnight = Date.parse("2026-10-31T16:00:00.000Z"); // Nov 1, 00:00 Manila
    expect(readRange(resolveProfitWindow({ preset: "this_month" }, midnight))).toEqual({ fromKey: "2026-11-01", toKey: "2026-11-01" });
  });

  it("opens Expenses on one category for the same days", () => {
    expect(expensesHref({ fromKey: "2026-10-01", toKey: "2026-10-22" }, "rent")).toBe(
      "/(main)/expenses?category=rent&from=2026-10-01&to=2026-10-22",
    );
  });

  it("opens every expense for the same days", () => {
    expect(expensesHref({ fromKey: "2026-09-01", toKey: "2026-09-30" })).toBe("/(main)/expenses?from=2026-09-01&to=2026-09-30");
  });

  it("escapes an id it does not control", () => {
    expect(expensesHref({ fromKey: "2026-10-01", toKey: "2026-10-01" }, "a&b")).toBe("/(main)/expenses?category=a%26b&from=2026-10-01&to=2026-10-01");
  });
});

describe("what each finding's button opens", () => {
  it("records, adds, sorts or opens the recipes", () => {
    expect(findingHref({ kind: "record", label: "Record", categoryId: "rent" })).toBe("/(main)/expenses?add=1&category=rent");
    expect(findingHref({ kind: "add", label: "Add expense" })).toBe("/(main)/expenses?add=1");
    expect(findingHref({ kind: "sort", label: "Sort" })).toBe("/(main)/expenses?view=unsorted");
    expect(findingHref({ kind: "recipes", label: "Add recipes" })).toBe("/(main)/product-management");
  });
});
