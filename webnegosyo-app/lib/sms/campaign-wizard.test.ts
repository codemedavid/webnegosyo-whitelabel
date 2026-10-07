/**
 * The guided campaign flow's rules.
 *
 * The old editor showed fifteen fields at once and asked the merchant to work
 * out which ones mattered. The wizard asks one question per screen, so the
 * rules that decide "may I go on?", "which audience card is this?" and "what
 * does this schedule mean in words?" are where the flow can quietly lie. They
 * are tested here, away from React.
 */
import {
  AUDIENCE_SEGMENTS,
  NEW_CAMPAIGN_STEPS,
  SEND_TIME_PRESETS,
  applyAudienceSegment,
  describeAudience,
  describeSchedule,
  firstIncompleteStep,
  formatTime12h,
  insertToken,
  isStepComplete,
  matchAudienceSegment,
  nextStep,
  previousStep,
  switchScheduleKind,
} from "./campaign-wizard";
import { EMPTY_CAMPAIGN_DRAFT, validateCampaignDraft, type CampaignDraft } from "./campaign-form";
import { buildPresetDraft, CAMPAIGN_PRESETS } from "./campaign-presets";

const TODAY = "2026-10-06";

function draftWith(changes: Partial<CampaignDraft>): CampaignDraft {
  return { ...EMPTY_CAMPAIGN_DRAFT, ...changes };
}

describe("step order", () => {
  it("asks goal, message, who, when, then review", () => {
    expect(NEW_CAMPAIGN_STEPS).toEqual(["goal", "message", "audience", "schedule", "review"]);
  });

  it("moves forward and back one step at a time and stops at the ends", () => {
    expect(nextStep("goal")).toBe("message");
    expect(nextStep("schedule")).toBe("review");
    expect(nextStep("review")).toBe("review");
    expect(previousStep("message")).toBe("goal");
    expect(previousStep("goal")).toBeNull();
  });
});

describe("isStepComplete", () => {
  it("blocks the message step until there is a name and a message", () => {
    const validation = validateCampaignDraft(EMPTY_CAMPAIGN_DRAFT, TODAY);

    expect(isStepComplete("message", validation)).toBe(false);
  });

  it("lets the message step through even while the schedule is still wrong", () => {
    // The blank draft has no date. That is the WHEN step's problem; holding the
    // merchant on the message screen for it is the old form all over again.
    const validation = validateCampaignDraft(
      draftWith({ name: "Hello", messageTemplate: "Hi {{firstName}}" }),
      TODAY
    );

    expect(validation.isValid).toBe(false);
    expect(isStepComplete("message", validation)).toBe(true);
    expect(isStepComplete("schedule", validation)).toBe(false);
  });

  it("never blocks the goal or audience steps", () => {
    const validation = validateCampaignDraft(EMPTY_CAMPAIGN_DRAFT, TODAY);

    expect(isStepComplete("goal", validation)).toBe(true);
    expect(isStepComplete("audience", validation)).toBe(true);
  });

  it("only completes review when the whole draft is valid", () => {
    const valid = validateCampaignDraft(buildPresetDraft("win_back", TODAY), TODAY);
    const invalid = validateCampaignDraft(EMPTY_CAMPAIGN_DRAFT, TODAY);

    expect(isStepComplete("review", valid)).toBe(true);
    expect(isStepComplete("review", invalid)).toBe(false);
  });
});

describe("firstIncompleteStep", () => {
  it("points at the earliest step that needs fixing", () => {
    const validation = validateCampaignDraft(EMPTY_CAMPAIGN_DRAFT, TODAY);

    expect(firstIncompleteStep(validation)).toBe("message");
  });

  it("is null for a valid draft", () => {
    const validation = validateCampaignDraft(buildPresetDraft("thank_regulars", TODAY), TODAY);

    expect(firstIncompleteStep(validation)).toBeNull();
  });
});

describe("audience segments", () => {
  it("recognises every segment from the filter it writes", () => {
    for (const segment of AUDIENCE_SEGMENTS) {
      expect(matchAudienceSegment(applyAudienceSegment({}, segment.id))).toBe(segment.id);
    }
  });

  it("calls an empty filter 'everyone'", () => {
    expect(matchAudienceSegment({})).toBe("everyone");
  });

  it("calls anything hand-tuned 'custom'", () => {
    expect(matchAudienceSegment({ lastOrderOlderThanDays: 45 })).toBe("custom");
    expect(matchAudienceSegment({ minOrderCount: 2, lastOrderOlderThanDays: 14 })).toBe("custom");
  });

  it("treats a filter the editor cannot show as custom, never as a named card", () => {
    // A campaign saved with a spend floor must not be mislabelled "Everyone".
    expect(matchAudienceSegment({ minTotalSpent: 500 })).toBe("custom");
  });

  it("keeps filters the editor does not manage when a card is tapped", () => {
    const next = applyAudienceSegment(
      { minTotalSpent: 500, lastOrderOlderThanDays: 45 },
      "regulars"
    );

    expect(next.minTotalSpent).toBe(500);
    expect(next.lastOrderOlderThanDays).toBeUndefined();
  });

  it("does not share the segment's filter object with the caller", () => {
    const first = applyAudienceSegment({}, "lapsed");
    const second = applyAudienceSegment({}, "lapsed");

    expect(first).not.toBe(second);
  });
});

describe("describeAudience", () => {
  it("names the whole list when there is no filter", () => {
    expect(describeAudience({})).toBe("Everyone who agreed to texts");
  });

  it("reads a combined filter as one sentence", () => {
    expect(describeAudience({ minOrderCount: 2, lastOrderOlderThanDays: 14 })).toBe(
      "Guests with 2+ orders, quiet for 14+ days"
    );
  });

  it("says first-timers plainly", () => {
    expect(describeAudience({ maxOrderCount: 1 })).toBe("Guests with at most 1 order");
  });

  it("reads equal bounds as an exact count", () => {
    expect(describeAudience({ minOrderCount: 1, maxOrderCount: 1 })).toBe(
      "Guests with exactly 1 order"
    );
  });
});

describe("first-timers segment", () => {
  it("never includes a guest with no orders yet", () => {
    const filter = AUDIENCE_SEGMENTS.find((segment) => segment.id === "first_timers")?.filter;
    expect(filter).toEqual({ minOrderCount: 1, maxOrderCount: 1 });
  });
});

describe("formatTime12h", () => {
  it.each([
    ["00:00", "12:00 AM"],
    ["09:05", "9:05 AM"],
    ["12:30", "12:30 PM"],
    ["18:00", "6:00 PM"],
  ])("%s reads as %s", (input, expected) => {
    expect(formatTime12h(input)).toBe(expected);
  });

  it("returns a malformed time untouched rather than inventing one", () => {
    expect(formatTime12h("soon")).toBe("soon");
  });
});

describe("describeSchedule", () => {
  it("says today and tomorrow out loud", () => {
    expect(
      describeSchedule(draftWith({ scheduleKind: "one_off", scheduleDate: TODAY }), TODAY)
    ).toBe("Once, today at 10:00 AM");
    expect(
      describeSchedule(draftWith({ scheduleKind: "one_off", scheduleDate: "2026-10-07" }), TODAY)
    ).toBe("Once, tomorrow at 10:00 AM");
  });

  it("names a later date", () => {
    expect(
      describeSchedule(
        draftWith({ scheduleKind: "one_off", scheduleDate: "2026-12-24", scheduleTime: "18:00" }),
        TODAY
      )
    ).toBe("Once, Dec 24 at 6:00 PM");
  });

  it("asks for a date when there is none", () => {
    expect(describeSchedule(draftWith({ scheduleKind: "one_off" }), TODAY)).toBe(
      "Once — pick a date"
    );
  });

  it("reads a repeating interval", () => {
    expect(
      describeSchedule(
        draftWith({ scheduleKind: "every_n_days", scheduleIntervalDays: 14 }),
        TODAY
      )
    ).toBe("Every 14 days at 10:00 AM");
    expect(
      describeSchedule(draftWith({ scheduleKind: "every_n_days", scheduleIntervalDays: 1 }), TODAY)
    ).toBe("Every day at 10:00 AM");
  });

  it("reads weekly days in calendar order", () => {
    expect(
      describeSchedule(draftWith({ scheduleKind: "weekly", scheduleWeekdays: [5, 1] }), TODAY)
    ).toBe("Every Mon and Fri at 10:00 AM");
    expect(
      describeSchedule(
        draftWith({ scheduleKind: "weekly", scheduleWeekdays: [1, 3, 5] }),
        TODAY
      )
    ).toBe("Every Mon, Wed and Fri at 10:00 AM");
  });
});

describe("switchScheduleKind", () => {
  it("never leaves the schedule invalid after a switch", () => {
    for (const kind of ["one_off", "every_n_days", "weekly"] as const) {
      const switched = { ...EMPTY_CAMPAIGN_DRAFT, ...switchScheduleKind(EMPTY_CAMPAIGN_DRAFT, kind, TODAY) };
      const errors = validateCampaignDraft(
        { ...switched, name: "x", messageTemplate: "Hi" },
        TODAY
      ).errors;

      expect(errors).toEqual({});
    }
  });

  it("keeps a value the merchant already chose", () => {
    const draft = draftWith({ scheduleIntervalDays: 30, scheduleWeekdays: [2] });

    expect(switchScheduleKind(draft, "every_n_days", TODAY).scheduleIntervalDays).toBe(30);
    expect(switchScheduleKind(draft, "weekly", TODAY).scheduleWeekdays).toEqual([2]);
  });

  it("re-dates a one-off that has drifted into the past", () => {
    const draft = draftWith({ scheduleDate: "2026-01-01" });

    expect(switchScheduleKind(draft, "one_off", TODAY).scheduleDate).toBe(TODAY);
  });
});

describe("insertToken", () => {
  it("drops the token where the cursor is", () => {
    expect(insertToken("Hi , welcome", { start: 3, end: 3 }, "{{firstName}}")).toEqual({
      text: "Hi {{firstName}}, welcome",
      cursor: 16,
    });
  });

  it("replaces a selection", () => {
    expect(insertToken("Hi NAME!", { start: 3, end: 7 }, "{{firstName}}").text).toBe(
      "Hi {{firstName}}!"
    );
  });

  it("appends with a space when there is no cursor yet", () => {
    expect(insertToken("Hi", null, "{{firstName}}").text).toBe("Hi {{firstName}}");
    expect(insertToken("", null, "{{storeName}}").text).toBe("{{storeName}}");
  });

  it("clamps a stale selection to the text", () => {
    expect(insertToken("Hi", { start: 40, end: 50 }, "{{storeName}}").text).toBe(
      "Hi{{storeName}}"
    );
  });
});

describe("SEND_TIME_PRESETS", () => {
  it("are valid 24-hour times outside default quiet hours", () => {
    for (const preset of SEND_TIME_PRESETS) {
      expect(preset.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(preset.time >= "08:00" && preset.time < "21:00").toBe(true);
    }
  });
});

describe("presets carry a short tagline for the goal grid", () => {
  it("has one, short enough for a tile", () => {
    for (const preset of CAMPAIGN_PRESETS) {
      expect(preset.tagline.length).toBeGreaterThan(0);
      expect(preset.tagline.length).toBeLessThanOrEqual(32);
    }
  });
});
