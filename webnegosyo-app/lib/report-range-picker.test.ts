import {
  beginDraft,
  draftSelection,
  isDayInDraft,
  setDraftMode,
  tapDay,
  type PickerDraft,
} from "./report-range-picker";

const NOW = Date.parse("2026-09-19T05:00:00.000Z"); // Fri 19 Sep 2026, Manila

describe("beginDraft", () => {
  it("opens on the selection the report is already showing", () => {
    const draft = beginDraft({ kind: "day", dayKey: "2026-09-03" }, NOW);

    expect(draft.mode).toBe("day");
    expect(draftSelection(draft)).toEqual({ kind: "day", dayKey: "2026-09-03" });
  });

  it("opens a range selection back in range mode", () => {
    const draft = beginDraft({ kind: "range", fromKey: "2026-09-01", toKey: "2026-09-14" }, NOW);

    expect(draft.mode).toBe("range");
    expect(draftSelection(draft)).toEqual({
      kind: "range",
      fromKey: "2026-09-01",
      toKey: "2026-09-14",
    });
  });

  it("opens a preset on today, with nothing yet chosen to apply", () => {
    // Coming from a preset there is no day to carry over, so Apply stays
    // inert until the merchant actually taps one.
    const draft = beginDraft({ kind: "preset", days: 7 }, NOW);

    expect(draft.mode).toBe("day");
    expect(draftSelection(draft)).toBeNull();
  });
});

describe("tapDay — single day mode", () => {
  it("picks that day", () => {
    const draft = tapDay(beginDraft({ kind: "preset", days: 7 }, NOW), "2026-09-03", NOW);

    expect(draftSelection(draft)).toEqual({ kind: "day", dayKey: "2026-09-03" });
  });

  it("replaces the previous pick rather than starting a range", () => {
    let draft = tapDay(beginDraft({ kind: "preset", days: 7 }, NOW), "2026-09-03", NOW);
    draft = tapDay(draft, "2026-09-10", NOW);

    expect(draftSelection(draft)).toEqual({ kind: "day", dayKey: "2026-09-10" });
  });

  it("ignores a future day", () => {
    // Rendered disabled, but a tap must not slip through and produce an empty
    // report that looks like missing data.
    const draft = tapDay(beginDraft({ kind: "preset", days: 7 }, NOW), "2026-12-25", NOW);

    expect(draftSelection(draft)).toBeNull();
  });
});

describe("tapDay — range mode", () => {
  function rangeDraft(): PickerDraft {
    return setDraftMode(beginDraft({ kind: "preset", days: 7 }, NOW), "range");
  }

  it("waits for the second tap before it has a range to apply", () => {
    const draft = tapDay(rangeDraft(), "2026-09-01", NOW);

    expect(draftSelection(draft)).toBeNull();
  });

  it("completes the range on the second tap", () => {
    let draft = tapDay(rangeDraft(), "2026-09-01", NOW);
    draft = tapDay(draft, "2026-09-14", NOW);

    expect(draftSelection(draft)).toEqual({
      kind: "range",
      fromKey: "2026-09-01",
      toKey: "2026-09-14",
    });
  });

  it("orders the range when the later day is tapped first", () => {
    let draft = tapDay(rangeDraft(), "2026-09-14", NOW);
    draft = tapDay(draft, "2026-09-01", NOW);

    expect(draftSelection(draft)).toEqual({
      kind: "range",
      fromKey: "2026-09-01",
      toKey: "2026-09-14",
    });
  });

  it("starts a new range on the third tap", () => {
    let draft = tapDay(rangeDraft(), "2026-09-01", NOW);
    draft = tapDay(draft, "2026-09-14", NOW);
    draft = tapDay(draft, "2026-09-20" > "2026-09-19" ? "2026-09-18" : "2026-09-18", NOW);

    expect(draftSelection(draft)).toBeNull();
    expect(isDayInDraft(draft, "2026-09-18")).toBe(true);
    expect(isDayInDraft(draft, "2026-09-01")).toBe(false);
  });

  it("accepts a single-day range when the same day is tapped twice", () => {
    let draft = tapDay(rangeDraft(), "2026-09-03", NOW);
    draft = tapDay(draft, "2026-09-03", NOW);

    expect(draftSelection(draft)).toEqual({
      kind: "range",
      fromKey: "2026-09-03",
      toKey: "2026-09-03",
    });
  });
});

describe("setDraftMode", () => {
  it("keeps a picked day when switching to range, as the range's start", () => {
    // Switching modes should not throw away the tap the merchant just made.
    const day = tapDay(beginDraft({ kind: "preset", days: 7 }, NOW), "2026-09-03", NOW);

    const draft = setDraftMode(day, "range");

    expect(draft.mode).toBe("range");
    expect(isDayInDraft(draft, "2026-09-03")).toBe(true);
    expect(draftSelection(draft)).toBeNull();
  });

  it("keeps a range's start day when switching to single day", () => {
    let draft = tapDay(setDraftMode(beginDraft({ kind: "preset", days: 7 }, NOW), "range"), "2026-09-01", NOW);
    draft = tapDay(draft, "2026-09-14", NOW);

    const asDay = setDraftMode(draft, "day");

    expect(draftSelection(asDay)).toEqual({ kind: "day", dayKey: "2026-09-01" });
  });
});

describe("isDayInDraft", () => {
  it("highlights every day between the two ends of a range", () => {
    let draft = setDraftMode(beginDraft({ kind: "preset", days: 7 }, NOW), "range");
    draft = tapDay(draft, "2026-09-01", NOW);
    draft = tapDay(draft, "2026-09-05", NOW);

    expect(isDayInDraft(draft, "2026-09-01")).toBe(true);
    expect(isDayInDraft(draft, "2026-09-03")).toBe(true);
    expect(isDayInDraft(draft, "2026-09-05")).toBe(true);
    expect(isDayInDraft(draft, "2026-09-06")).toBe(false);
    expect(isDayInDraft(draft, "2026-08-31")).toBe(false);
  });

  it("highlights only the picked day in single-day mode", () => {
    const draft = tapDay(beginDraft({ kind: "preset", days: 7 }, NOW), "2026-09-03", NOW);

    expect(isDayInDraft(draft, "2026-09-03")).toBe(true);
    expect(isDayInDraft(draft, "2026-09-04")).toBe(false);
  });
});
