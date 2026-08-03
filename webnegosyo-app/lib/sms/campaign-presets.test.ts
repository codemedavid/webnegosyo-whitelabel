/**
 * Ready-made campaigns.
 *
 * The empty draft is not saveable: a one-off with no date fails validation, so
 * a merchant opening "New campaign" is met with a form that is already wrong
 * and six fields they have to reason about before anything can be saved.
 *
 * A preset is one tap that produces a campaign that is valid, sensible and
 * ready to activate. The load-bearing test is the first one — a preset that
 * builds an invalid draft is worse than no preset, because the merchant now
 * has to work out which of the fields the app filled in for them is the wrong
 * one.
 */

import { CAMPAIGN_PRESETS, buildPresetDraft } from "./campaign-presets";
import { validateCampaignDraft, describeCampaignCost } from "./campaign-form";
import { validateTemplate } from "./message-template";

const TODAY = "2026-08-03";

describe("CAMPAIGN_PRESETS", () => {
  it("offers more than one starting point", () => {
    expect(CAMPAIGN_PRESETS.length).toBeGreaterThan(1);
  });

  it("gives every preset a unique id", () => {
    const ids = CAMPAIGN_PRESETS.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describes each preset in terms of who it texts, not what it configures", () => {
    for (const preset of CAMPAIGN_PRESETS) {
      expect(preset.title.trim()).not.toBe("");
      expect(preset.description.trim()).not.toBe("");
    }
  });
});

describe("buildPresetDraft", () => {
  it("builds a draft that is valid the moment it lands in the form", () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const draft = buildPresetDraft(preset.id, TODAY);

      const validation = validateCampaignDraft(draft, TODAY);
      expect({ preset: preset.id, errors: validation.errors }).toEqual({
        preset: preset.id,
        errors: {},
      });
    }
  });

  it("never dates a one-off preset in the past", () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const draft = buildPresetDraft(preset.id, TODAY);
      if (draft.scheduleKind !== "one_off") continue;

      expect(draft.scheduleDate).not.toBeNull();
      expect(String(draft.scheduleDate) >= TODAY).toBe(true);
    }
  });

  it("writes messages using only variables the renderer knows", () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const draft = buildPresetDraft(preset.id, TODAY);

      expect(validateTemplate(draft.messageTemplate).unknownVariables).toEqual([]);
    }
  });

  it("keeps every preset message inside a single SMS segment", () => {
    // A preset that silently costs the merchant two texts per guest is the
    // exact surprise the cost box exists to prevent.
    for (const preset of CAMPAIGN_PRESETS) {
      const draft = buildPresetDraft(preset.id, TODAY);

      const cost = describeCampaignCost(draft.messageTemplate, 1);
      expect({ preset: preset.id, segments: cost.segmentsPerMessage }).toEqual({
        preset: preset.id,
        segments: 1,
      });
    }
  });

  it("keeps preset messages on plain letters, so nobody pays the UCS-2 penalty", () => {
    for (const preset of CAMPAIGN_PRESETS) {
      const draft = buildPresetDraft(preset.id, TODAY);

      expect({ preset: preset.id, encoding: describeCampaignCost(draft.messageTemplate, 1).encoding })
        .toEqual({ preset: preset.id, encoding: "GSM7" });
    }
  });

  it("hands back an independent draft each time, so editing one cannot alter the preset", () => {
    const first = buildPresetDraft(CAMPAIGN_PRESETS[0].id, TODAY);
    const second = buildPresetDraft(CAMPAIGN_PRESETS[0].id, TODAY);

    first.audience.minOrderCount = 99;
    first.scheduleWeekdays.push(7);

    expect(second.audience.minOrderCount).not.toBe(99);
    expect(second.scheduleWeekdays).not.toContain(7);
  });

  it("throws on an unknown preset rather than returning a blank campaign", () => {
    // A silent empty draft would look like the tap did nothing.
    expect(() => buildPresetDraft("not-a-preset", TODAY)).toThrow(/not-a-preset/);
  });

  it("names the campaign, so the merchant is not staring at an empty first field", () => {
    for (const preset of CAMPAIGN_PRESETS) {
      expect(buildPresetDraft(preset.id, TODAY).name.trim()).not.toBe("");
    }
  });
});
