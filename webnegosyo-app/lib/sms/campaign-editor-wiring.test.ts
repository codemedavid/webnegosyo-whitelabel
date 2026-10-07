/**
 * Guardrails for the campaign editor screen.
 *
 * Jest here only runs pure-logic roots, so — like `customers-screen-mount` —
 * this asserts on the screen source rather than rendering it. What it locks
 * down is wiring no unit test of the pure modules can see: that presets and the
 * test send are actually reachable from the editor, and that a test send stays
 * a rehearsal rather than quietly writing itself into the campaign's audit log.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");

function readCode(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const EDITOR = ["app", "(main)", "campaign", "[campaignId].tsx"];
const STEPS = ["components", "sms", "campaign"];
const AUDIENCE_STEP = [...STEPS, "AudienceStep.tsx"];
const MESSAGE_STEP = [...STEPS, "MessageStep.tsx"];
const SCHEDULE_STEP = [...STEPS, "ScheduleStep.tsx"];
const REVIEW_STEP = [...STEPS, "ReviewStep.tsx"];

describe("campaign editor — starting from a preset", () => {
  it("offers the ready-made campaigns instead of an empty form", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/CAMPAIGN_PRESETS/);
    expect(source).toMatch(/buildPresetDraft/);
  });

  it("opens a new campaign on the preset a Reports link names, and only a real one", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/preset\?: string/);
    expect(source).toMatch(/isNew && isCampaignPresetId\(preset\)/);
  });

  it("shows every audience filter a preset can set, so none is hidden from the merchant", () => {
    // The Who step's Fine-tune steppers are where these live now.
    const source = readCode(...AUDIENCE_STEP);

    expect(source).toMatch(/filter\.lastOrderOlderThanDays/);
    expect(source).toMatch(/filter\.minOrderCount/);
    expect(source).toMatch(/filter\.maxOrderCount/);
  });

  it("opens a new campaign on the goals, and a preset link straight on its message", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/isCampaignPresetId\(preset\) \? "message" : "goal"/);
    expect(source).toMatch(/<GoalStep/);
  });

  it("takes its presets from the shared module rather than hard-coding copy in the JSX", () => {
    // A second copy of the message text in the screen is how a preset starts
    // failing the validation its own test proves it passes.
    const source = readCode(...EDITOR);

    expect(source).toMatch(/from "\.\.\/\.\.\/\.\.\/lib\/sms\/campaign-presets"/);
  });
});

describe("campaign editor — the test send", () => {
  it("can rehearse the message before a campaign is ever activated", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/planTestSend/);
  });

  it("puts the rehearsal on the same transport a real run uses", () => {
    // Testing through a different path would prove the wrong thing: the open
    // question is whether the native module can send at all.
    const source = readCode(...EDITOR);

    expect(source).toMatch(/createSmsTransport/);
  });

  it("never records a test send against the campaign's audit log", () => {
    // `sms_sends` is the idempotency unit. A rehearsal row would make a resumed
    // run skip a real guest who was never texted.
    const source = readCode(...EDITOR);

    expect(source).not.toMatch(/recordSend/);
  });

  it("does not gate the rehearsal behind the campaign being due", () => {
    // `dueRunId` gates the real send. Gating the test send on it too would put
    // the merchant back where they started: unable to try anything.
    const source = readCode(...EDITOR);
    // The handler itself, not everything below it: the real send further down
    // is gated on `dueRunId` and legitimately so.
    const start = source.indexOf("const sendTest");
    const handler = source.slice(start, source.indexOf("const sendNow", start));

    expect(start).toBeGreaterThan(-1);
    expect(handler).toMatch(/planTestSend/);
    expect(handler).not.toMatch(/dueRunId/);
  });
});

describe("campaign editor — Send now", () => {
  it("offers a send that does not wait for the schedule", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/decideSendNow/);
  });

  it("does not gate the manual send behind the campaign being due", () => {
    // `dueRunId` is set only when the schedule says so. Requiring it is the
    // exact limitation Send now exists to remove.
    const source = readCode(...EDITOR);
    const start = source.indexOf("const sendNow");
    const handler = source.slice(start, source.indexOf("\n  const ", start + 10));

    expect(start).toBeGreaterThan(-1);
    expect(handler).not.toMatch(/dueRunId/);
  });

  it("consumes a one-off after a manual send, so it cannot fire twice", () => {
    // Without this the campaign's own scheduled date is still ahead of
    // `lastRunAt` and the same guests get a second text.
    const source = readCode(...EDITOR);

    expect(source).toMatch(/consumesCampaign/);
  });

  it("creates the run at a quantized instant, so a double-tap is one run", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/immediateRunAt/);
  });
});

describe("campaign editor — reaching the Send button at all", () => {
  it("stays on the campaign it just created instead of bouncing to the list", () => {
    // The whole Send block is gated on `!isNew`. Going back after a save means
    // the campaign you just wrote NEVER shows a Send button: you have to find
    // it in the list and re-open it. That is the likeliest reason "Send now is
    // not available" — the button exists and is simply unreachable.
    const source = readCode(...EDITOR);
    const start = source.indexOf("const save");
    const handler = source.slice(start, source.indexOf("\n  const ", start + 10));

    expect(start).toBeGreaterThan(-1);
    expect(handler).toMatch(/router\.replace/);
    expect(handler).not.toMatch(/router\.back/);
  });

  it("navigates to the real id returned by the insert, not the 'new' sentinel", () => {
    // Replacing with `new` again would re-enter create mode and lose the row.
    const source = readCode(...EDITOR);
    const start = source.indexOf("const save");
    const handler = source.slice(start, source.indexOf("\n  const ", start + 10));

    expect(handler).toMatch(/createCampaign\(/);
    expect(handler).toMatch(/campaignHref\(/);
  });

  it("pins the send action outside the scroll, so it cannot be scrolled away from", () => {
    // The strongest form of the guarantee the next test approximates. Send
    // used to be a button partway down a form roughly three screens long; a
    // merchant who never scrolled to it reported, correctly, that there was no
    // send button. A bar rendered after `</ScrollView>` is always on screen.
    const source = readCode(...EDITOR);

    expect(source).toMatch(/styles\.actionBar/);
    expect(source.indexOf("styles.actionBar")).toBeGreaterThan(
      source.indexOf("</ScrollView>")
    );
  });

  it("puts Send in the pinned bar of a saved campaign, not at the end of a form", () => {
    // Send used to be the last thing on a long scroll, under status and quiet
    // hours. A saved campaign now opens on its summary with Send in the bar.
    const source = readCode(...EDITOR);

    expect(source).toMatch(/if \(!isNew\) return "review"/);
    expect(source.indexOf("label={sendLabel}")).toBeGreaterThan(
      source.indexOf("styles.actionBar")
    );
  });

  it("lands a just-created campaign on its summary, saying it was saved", () => {
    const source = readCode(...EDITOR);
    const start = source.indexOf("const save");
    const handler = source.slice(start, source.indexOf("\n  const ", start + 10));

    expect(handler).toMatch(/created=1/);
    expect(readCode(...REVIEW_STEP)).toMatch(/isJustCreated/);
  });

  it("walks Android's back button through the steps instead of dropping the draft", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/hardwareBackPress/);
  });
});

describe("campaign editor — saying why it will not send", () => {
  it("shows the blocking reason as a notice, not a grey aside", () => {
    // A disabled button with faint hint text underneath reads as "broken app",
    // which is exactly how it was reported.
    const source = readCode(...EDITOR);
    const start = source.indexOf("sendNowDecision.message");
    const line = source.slice(Math.max(0, start - 300), start);

    expect(start).toBeGreaterThan(-1);
    expect(line).toMatch(/styles\.notice/);
  });

  it("offers a way out when nobody has opted in yet", () => {
    // "Nobody matches this campaign yet" is a dead end unless it says where
    // consent is recorded. That screen is the Customers tab.
    const source = readCode(...EDITOR);

    expect(source).toMatch(/no_audience/);
    expect(source).toMatch(/customers/i);
  });
});

describe("campaign editor — showing the message before it is sent", () => {
  it("renders the message as the guest will read it, placeholders filled in", () => {
    // Placeholders are the one part of a campaign a merchant cannot check by
    // reading what they typed: `{{frstName}}` looks fine and is delivered
    // literally to everyone on the list.
    const source = readCode(...EDITOR);

    expect(source).toMatch(/buildMessagePreview/);
    expect(readCode(...MESSAGE_STEP)).toMatch(/<MessagePreview/);
    expect(readCode(...REVIEW_STEP)).toMatch(/<MessagePreview/);
  });

  it("keeps the cost attached to the message rather than in a box of its own", () => {
    // Segments are a property of the exact text above them. Separated, a
    // merchant edits the words and never sees the price double.
    const step = readCode(...MESSAGE_STEP);
    const preview = step.slice(step.indexOf("<MessagePreview"));

    expect(preview.slice(0, 300)).toMatch(/cost=\{cost\}/);
    // The summary's preview is handed the same cost through its props.
    expect(readCode(...EDITOR)).toMatch(/const previewProps = \{[\s\S]{0,120}cost,/);
  });

  it("inserts a placeholder at the cursor, not glued onto the end", () => {
    expect(readCode(...MESSAGE_STEP)).toMatch(/insertToken\(/);
  });
});

describe("campaign editor — picking a date and a time", () => {
  it("offers a calendar rather than asking for YYYY-MM-DD by hand", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/DateTimePicker/);
    expect(source).toMatch(/mode="date"|mode={"date"}/);
  });

  it("offers a clock for the send time and both quiet hours", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/mode="time"|mode={"time"}/);
  });

  it("offers one-tap times and days, and says nothing sends behind the merchant's back", () => {
    const source = readCode(...SCHEDULE_STEP);

    expect(source).toMatch(/SEND_TIME_PRESETS/);
    expect(source).toMatch(/switchScheduleKind/);
    expect(source).toMatch(/you tap Send/);
  });

  it("keeps storing the plain strings the schedule already understands", () => {
    // `schedule.ts`, validation and every existing test speak YYYY-MM-DD and
    // HH:MM. The picker is how the string gets typed, not a new format.
    const source = readCode(...EDITOR);

    expect(source).toMatch(/from "\.\.\/\.\.\/\.\.\/lib\/sms\/date-fields"/);
  });
});
