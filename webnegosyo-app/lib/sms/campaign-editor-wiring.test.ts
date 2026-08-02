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

describe("campaign editor — starting from a preset", () => {
  it("offers the ready-made campaigns instead of an empty form", () => {
    const source = readCode(...EDITOR);

    expect(source).toMatch(/CAMPAIGN_PRESETS/);
    expect(source).toMatch(/buildPresetDraft/);
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
