import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { GoalStep, BLANK_GOAL_ID } from "./GoalStep";
import { AudienceStep } from "./AudienceStep";
import { MessageStep } from "./MessageStep";
import { ReviewStep } from "./ReviewStep";
import { CAMPAIGN_PRESETS } from "../../../lib/sms/campaign-presets";
import { describeCampaignCost } from "../../../lib/sms/campaign-form";
import { buildMessagePreview, buildPreviewSegments } from "../../../lib/sms/message-preview";

const STORE = "Nanay's Kitchen";

function previewFor(template: string) {
  return {
    preview: buildMessagePreview(template, null, STORE),
    segments: buildPreviewSegments(template, null, STORE),
    cost: describeCampaignCost(template, 12),
    recipientCount: 12,
    recipientName: null,
    storeName: STORE,
    timestamp: "Today · 10:00 AM",
  };
}

describe("GoalStep", () => {
  it("shows how many guests each goal reaches and picks it in one tap", () => {
    const onPick = jest.fn();
    const screen = render(
      <GoalStep
        presets={CAMPAIGN_PRESETS}
        reachById={{ win_back: 42 }}
        selectedId={null}
        onPick={onPick}
      />
    );

    expect(screen.getByText("42 guests")).toBeTruthy();
    fireEvent.press(screen.getByText(CAMPAIGN_PRESETS[0].title));
    expect(onPick).toHaveBeenCalledWith(CAMPAIGN_PRESETS[0].id);
  });

  it("says 'Nobody yet' rather than a bare zero", () => {
    const screen = render(
      <GoalStep presets={CAMPAIGN_PRESETS} reachById={{}} selectedId={null} onPick={jest.fn()} />
    );

    expect(screen.getAllByText("Nobody yet").length).toBe(CAMPAIGN_PRESETS.length);
  });

  it("offers a blank start", () => {
    const onPick = jest.fn();
    const screen = render(
      <GoalStep presets={CAMPAIGN_PRESETS} reachById={{}} selectedId={null} onPick={onPick} />
    );

    fireEvent.press(screen.getByText("Write your own"));
    expect(onPick).toHaveBeenCalledWith(BLANK_GOAL_ID);
  });
});

describe("AudienceStep", () => {
  const base = {
    reachBySegment: { everyone: 50, lapsed: 20, regulars: 10, first_timers: 8, recent: 30 },
    matchedCount: 50,
    totalGuests: 80,
    excludedSummary: {
      no_phone: 5,
      no_consent: 25,
      opted_out: 0,
      suppressed: 0,
      recently_texted: 0,
      filter: 0,
    },
    onRecordConsent: jest.fn(),
  };

  it("swaps the audience for a card's group when tapped", () => {
    const onChange = jest.fn();
    const screen = render(<AudienceStep {...base} filter={{}} onChange={onChange} />);

    fireEvent.press(screen.getByText("Regulars"));
    expect(onChange).toHaveBeenCalledWith({ minOrderCount: 3 });
  });

  it("points at the guests who have not agreed to texts", () => {
    const onRecordConsent = jest.fn();
    const screen = render(
      <AudienceStep {...base} onRecordConsent={onRecordConsent} filter={{}} onChange={jest.fn()} />
    );

    fireEvent.press(screen.getByText("25 haven't agreed yet — record who did"));
    expect(onRecordConsent).toHaveBeenCalled();
  });

  it("adds a fine-tune rule at a sensible starting value", () => {
    const onChange = jest.fn();
    const screen = render(<AudienceStep {...base} filter={{}} onChange={onChange} />);

    fireEvent.press(screen.getByText("Fine-tune"));
    fireEvent.press(screen.getByLabelText("Add rule: At least"));
    expect(onChange).toHaveBeenCalledWith({ minOrderCount: 2 });
  });
});

describe("MessageStep", () => {
  it("adds a placeholder from a chip instead of asking for the syntax", () => {
    const onChangeMessage = jest.fn();
    const template = "Hi";
    const screen = render(
      <MessageStep
        name="Hello"
        messageTemplate={template}
        cost={describeCampaignCost(template, 12)}
        preview={previewFor(template)}
        onChangeName={jest.fn()}
        onChangeMessage={onChangeMessage}
      />
    );

    fireEvent.press(screen.getByLabelText("Add First name"));
    expect(onChangeMessage).toHaveBeenCalledWith("Hi {{firstName}}");
  });

  it("lights up the guest's name in the preview", () => {
    const template = "Hi {{firstName}}!";
    const screen = render(
      <MessageStep
        name="Hello"
        messageTemplate={template}
        cost={describeCampaignCost(template, 12)}
        preview={previewFor(template)}
        onChangeName={jest.fn()}
        onChangeMessage={jest.fn()}
      />
    );

    expect(screen.getByText("Maria")).toBeTruthy();
  });
});

describe("ReviewStep", () => {
  const props = {
    isNew: true,
    name: "Win back",
    preview: previewFor("Hi {{firstName}}"),
    audienceLine: "Guests quiet for 21+ days",
    recipientCount: 12,
    scheduleLine: "Every 14 days at 10:00 AM",
    problemStep: null,
    isJustCreated: false,
    testSend: {
      isAvailable: true,
      phone: "",
      onChangePhone: jest.fn(),
      onSend: jest.fn(),
      isSending: false,
      outcome: null,
    },
    runResult: null,
    runError: null,
  };

  it("jumps back to a step from its summary row", () => {
    const onEdit = jest.fn();
    const screen = render(<ReviewStep {...props} onEdit={onEdit} />);

    fireEvent.press(screen.getByLabelText("When: Every 14 days at 10:00 AM. Edit."));
    expect(onEdit).toHaveBeenCalledWith("schedule");
  });

  it("names the step that blocks saving", () => {
    const screen = render(<ReviewStep {...props} problemStep="schedule" onEdit={jest.fn()} />);

    expect(screen.getByText("Fix when it sends before this can be saved.")).toBeTruthy();
  });

  it("confirms a just-created campaign", () => {
    const screen = render(<ReviewStep {...props} isNew={false} isJustCreated onEdit={jest.fn()} />);

    expect(screen.getByText("Campaign saved and active")).toBeTruthy();
  });
});
