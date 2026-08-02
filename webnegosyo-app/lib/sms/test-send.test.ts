/**
 * Texting yourself the message before texting everyone else.
 *
 * The send path has only ever been exercised against fakes: the Kotlin module
 * has never put a real message on a real network. There is no way to find that
 * out today short of activating a campaign and blasting real guests, which is
 * exactly the wrong first test.
 *
 * A test send takes one number the merchant types, renders the campaign's own
 * template through the same renderer a real run uses, and hands it to the same
 * transport. What these tests pin is that it is a REHEARSAL and not a shortcut:
 * the body is byte-for-byte what a guest would receive, the cost is reported,
 * and a bad number or a broken template is refused here rather than discovered
 * mid-run.
 */

import { planTestSend } from "./test-send";

const INPUT = {
  phone: "0917 000 0002",
  template: "Hi {{firstName}}, {{storeName}} misses you!",
  storeName: "Kubo Cafe",
};

function planOf(overrides: Partial<typeof INPUT> = {}) {
  const result = planTestSend({ ...INPUT, ...overrides });
  if (!result.ok) throw new Error(`expected a plan, got: ${result.error}`);
  return result.plan;
}

describe("planTestSend", () => {
  it("accepts the number the way a merchant actually types it", () => {
    expect(planOf().phoneE164).toBe("+639170000002");
  });

  it("renders the placeholders, so the merchant reads what a guest reads", () => {
    // A test that arrives saying "Hi {{firstName}}" proves nothing about the
    // message and everything about the rehearsal being fake.
    const body = planOf().body;

    expect(body).not.toContain("{{");
    expect(body).toContain("Kubo Cafe");
  });

  it("reports what one message costs, so the rehearsal prices the campaign too", () => {
    const plan = planOf();

    expect(plan.segments).toBe(1);
    expect(plan.encoding).toBe("GSM7");
  });

  it("prices a curly apostrophe as the UCS-2 message it really is", () => {
    const plan = planOf({ template: "We’re open late tonight at {{storeName}}!" });

    expect(plan.encoding).toBe("UCS2");
  });

  it("refuses a number that cannot be dialled", () => {
    const result = planTestSend({ ...INPUT, phone: "12345" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/number/i);
  });

  it("refuses a blank number instead of texting nowhere", () => {
    const result = planTestSend({ ...INPUT, phone: "   " });

    expect(result.ok).toBe(false);
  });

  it("refuses an empty message", () => {
    const result = planTestSend({ ...INPUT, template: "   " });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/message/i);
  });

  it("names the unknown variable rather than sending a message with a hole in it", () => {
    const result = planTestSend({ ...INPUT, template: "Hi {{frstName}}, come back!" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("frstName");
  });

  it("fills the sample guest with plausible values, not blanks", () => {
    const body = planOf({
      template: "{{firstName}} / {{orderCount}} / {{lastOrderDate}}",
    });

    expect(body).not.toMatch(/(^| )\/( |$)\s*\//);
    expect(body.split("/").every((part) => part.trim() !== "")).toBe(true);
  });

  it("keeps the rehearsal identical to the real thing for the same template", () => {
    // Same template in, same body out — no "[TEST]" prefix, no truncation.
    // A body that differs from the real one makes the segment count a lie.
    const first = planOf();
    const second = planOf({ phone: "+639170000002" });

    expect(second.body).toBe(first.body);
  });
});
