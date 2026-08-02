import {
  EMPTY_CAMPAIGN_DRAFT,
  describeCampaignCost,
  validateCampaignDraft,
} from "./campaign-form";
import type { CampaignDraft } from "./campaign-form";

const TODAY = "2026-08-16";

function draft(overrides: Partial<CampaignDraft> = {}): CampaignDraft {
  return {
    ...EMPTY_CAMPAIGN_DRAFT,
    name: "Win back lapsed guests",
    messageTemplate: "Hi {{firstName}}, we miss you at {{storeName}}!",
    scheduleKind: "one_off",
    scheduleDate: "2026-08-20",
    ...overrides,
  };
}

describe("validateCampaignDraft — the basics", () => {
  it("accepts a complete one-off campaign", () => {
    expect(validateCampaignDraft(draft(), TODAY)).toEqual({ isValid: true, errors: {} });
  });

  it("requires a name so the merchant can tell campaigns apart", () => {
    const result = validateCampaignDraft(draft({ name: "   " }), TODAY);

    expect(result.isValid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it("requires a message", () => {
    expect(validateCampaignDraft(draft({ messageTemplate: "" }), TODAY).errors.messageTemplate)
      .toBeDefined();
  });

  it("rejects a message using a variable that does not exist", () => {
    // This is the one that would otherwise reach hundreds of strangers as
    // "Hi , we miss you" — the renderer throws at send time, far too late.
    const result = validateCampaignDraft(
      draft({ messageTemplate: "Hi {{nickname}}" }),
      TODAY
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.messageTemplate).toMatch(/nickname/);
  });
});

describe("validateCampaignDraft — schedules", () => {
  it("requires a date for a one-off", () => {
    expect(
      validateCampaignDraft(draft({ scheduleKind: "one_off", scheduleDate: null }), TODAY)
        .errors.scheduleDate
    ).toBeDefined();
  });

  it("rejects a one-off dated in the past, which would never fire", () => {
    const result = validateCampaignDraft(draft({ scheduleDate: "2026-08-01" }), TODAY);

    expect(result.errors.scheduleDate).toMatch(/past/i);
  });

  it("accepts a one-off dated today", () => {
    expect(validateCampaignDraft(draft({ scheduleDate: TODAY }), TODAY).isValid).toBe(true);
  });

  it("requires a positive interval for a repeating campaign", () => {
    const base = draft({ scheduleKind: "every_n_days", scheduleDate: null });

    expect(validateCampaignDraft({ ...base, scheduleIntervalDays: null }, TODAY).errors
      .scheduleIntervalDays).toBeDefined();
    expect(validateCampaignDraft({ ...base, scheduleIntervalDays: 0 }, TODAY).errors
      .scheduleIntervalDays).toBeDefined();
  });

  it("accepts a valid repeating campaign", () => {
    const result = validateCampaignDraft(
      draft({ scheduleKind: "every_n_days", scheduleDate: null, scheduleIntervalDays: 14 }),
      TODAY
    );

    expect(result.isValid).toBe(true);
  });

  it("requires at least one weekday for a weekly campaign", () => {
    // The database CHECK was written with array_length, which returns NULL for
    // an empty array and let this through; the form must not depend on that
    // constraint being right.
    const result = validateCampaignDraft(
      draft({ scheduleKind: "weekly", scheduleDate: null, scheduleWeekdays: [] }),
      TODAY
    );

    expect(result.errors.scheduleWeekdays).toBeDefined();
  });

  it("rejects a weekday outside Monday–Sunday", () => {
    const result = validateCampaignDraft(
      draft({ scheduleKind: "weekly", scheduleDate: null, scheduleWeekdays: [0, 8] }),
      TODAY
    );

    expect(result.errors.scheduleWeekdays).toBeDefined();
  });

  it("accepts a valid weekly campaign", () => {
    const result = validateCampaignDraft(
      draft({ scheduleKind: "weekly", scheduleDate: null, scheduleWeekdays: [1, 4] }),
      TODAY
    );

    expect(result.isValid).toBe(true);
  });

  it("rejects a malformed send time", () => {
    expect(validateCampaignDraft(draft({ scheduleTime: "25:00" }), TODAY).errors.scheduleTime)
      .toBeDefined();
    expect(validateCampaignDraft(draft({ scheduleTime: "10am" }), TODAY).errors.scheduleTime)
      .toBeDefined();
  });

  it("accepts a well-formed send time", () => {
    expect(validateCampaignDraft(draft({ scheduleTime: "09:30" }), TODAY).isValid).toBe(true);
  });
});

describe("validateCampaignDraft — the per-run cap", () => {
  it("rejects a cap the database would refuse", () => {
    // Mirrors sms_campaigns_max_per_run_ck; failing here beats failing on save.
    expect(validateCampaignDraft(draft({ maxPerRun: 0 }), TODAY).errors.maxPerRun).toBeDefined();
    expect(validateCampaignDraft(draft({ maxPerRun: 201 }), TODAY).errors.maxPerRun)
      .toBeDefined();
  });

  it("accepts a cap inside the allowed range", () => {
    expect(validateCampaignDraft(draft({ maxPerRun: 25 }), TODAY).isValid).toBe(true);
  });

  it("defaults to a cap that stays under Android's throttle", () => {
    expect(EMPTY_CAMPAIGN_DRAFT.maxPerRun).toBeLessThanOrEqual(30);
    expect(EMPTY_CAMPAIGN_DRAFT.maxPerRun).toBeGreaterThan(0);
  });
});

describe("describeCampaignCost — what this blast will actually cost", () => {
  it("reports one segment per recipient for a short plain message", () => {
    expect(describeCampaignCost("Hi {{firstName}}!", 40)).toEqual({
      segmentsPerMessage: 1,
      totalSegments: 40,
      encoding: "GSM7",
      recipientCount: 40,
    });
  });

  it("counts the rendered length, not the raw template", () => {
    // "{{firstName}}" is 13 characters of template but renders to a name; a
    // merchant judging length by the template would misjudge every campaign.
    const withPlaceholder = describeCampaignCost(`${"a".repeat(150)}{{firstName}}`, 1);

    expect(withPlaceholder.segmentsPerMessage).toBe(1);
  });

  it("multiplies out a multipart message across the audience", () => {
    const result = describeCampaignCost("a".repeat(200), 10);

    expect(result.segmentsPerMessage).toBe(2);
    expect(result.totalSegments).toBe(20);
  });

  it("flags the encoding when one character makes the whole blast UCS-2", () => {
    const result = describeCampaignCost("Salamat po ’", 100);

    expect(result.encoding).toBe("UCS2");
  });

  it("costs nothing when nobody is reachable", () => {
    expect(describeCampaignCost("Hi!", 0)).toEqual({
      segmentsPerMessage: 1,
      totalSegments: 0,
      encoding: "GSM7",
      recipientCount: 0,
    });
  });
});
