import { createOutboxWorker, nextOutboxAttemptAt } from "./outbox-worker";
import { createSmsDeliveryJournal } from "../loyalty/sms-journal";

const tenantId = "11111111-1111-1111-1111-111111111111";
const messageId = "33333333-3333-3333-3333-333333333333";
const leaseToken = "44444444-4444-4444-4444-444444444444";
const now = Date.parse("2026-10-13T04:00:00Z");
const message = { messageId, leaseToken, phone: "+639171234567", body: "Hi Ana, we miss you at Kape!" };

function setup() {
  const api = {
    claim: jest.fn().mockResolvedValue({ message, wait: null }),
    finish: jest.fn().mockResolvedValue(true),
  };
  const transport = {
    isAvailable: true,
    prepare: jest.fn().mockResolvedValue(true),
    send: jest.fn().mockResolvedValue(undefined),
  };
  const rows = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => rows.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => void rows.set(key, value)),
    removeItem: jest.fn(async (key: string) => void rows.delete(key)),
  };
  const journal = createSmsDeliveryJournal(storage, { tenantId, actorId: tenantId, deviceId: tenantId }, "sms.outbox.ack.v1");
  return { api, transport, journal, rows, canSend: jest.fn().mockReturnValue(true), now: () => now };
}

describe("outbox worker", () => {
  it("sends one text and reports it", async () => {
    const deps = setup();
    expect(await createOutboxWorker(deps).runOnce()).toEqual({ result: "sent" });
    expect(deps.transport.send).toHaveBeenCalledWith(message.phone, message.body, expect.any(Function));
    expect(deps.api.finish).toHaveBeenCalledWith({ messageId, leaseToken }, "sent", undefined);
    expect(deps.rows.size).toBe(0);
  });

  it("keeps its journal apart from reward codes", async () => {
    const deps = setup();
    deps.transport.send.mockImplementation(async () => {
      expect([...deps.rows.keys()][0]).toMatch(/^sms\.outbox\.ack\.v1\./);
    });
    await createOutboxWorker(deps).runOnce();
    expect(deps.transport.send).toHaveBeenCalled();
  });

  it("passes the server's wait through", async () => {
    const deps = setup();
    deps.api.claim.mockResolvedValue({ message: null, wait: { reason: "paced", retryAt: "2026-10-13T04:20:00Z" } });
    expect(await createOutboxWorker(deps).runOnce()).toEqual({ result: "waiting", reason: "paced", retryAt: "2026-10-13T04:20:00Z" });
    expect(deps.transport.send).not.toHaveBeenCalled();
  });

  it("never sends a claim that looks wrong, and says it failed", async () => {
    const deps = setup();
    deps.api.claim.mockResolvedValue({ message: { ...message, phone: "0917 123 4567" }, wait: null });
    expect((await createOutboxWorker(deps).runOnce()).result).toBe("unavailable");
    expect(deps.transport.send).not.toHaveBeenCalled();
    expect(deps.api.finish).toHaveBeenCalledWith({ messageId, leaseToken }, "failed", "invalid_message");
  });

  it("reports a radio failure as failed, never retries the same text", async () => {
    const deps = setup();
    deps.transport.send.mockRejectedValue(new Error("RESULT_ERROR_RADIO_OFF"));
    expect((await createOutboxWorker(deps).runOnce()).result).toBe("uncertain");
    expect(deps.api.finish).toHaveBeenCalledWith({ messageId, leaseToken }, "failed", "send_failed");
    expect(deps.api.claim).toHaveBeenCalledTimes(1);
  });

  it("reports the SIM's own reason (no signal) so the owner can fix it", async () => {
    const deps = setup();
    deps.transport.send.mockRejectedValue(Object.assign(new Error("No mobile service."), { code: "NO_SERVICE" }));
    await createOutboxWorker(deps).runOnce();
    expect(deps.api.finish).toHaveBeenCalledWith({ messageId, leaseToken }, "failed", "no_service");
  });

  it("never reports an unknown error code verbatim", async () => {
    const deps = setup();
    deps.transport.send.mockRejectedValue(Object.assign(new Error("x"), { code: "ERR_Weird Code!" }));
    await createOutboxWorker(deps).runOnce();
    expect(deps.api.finish).toHaveBeenCalledWith({ messageId, leaseToken }, "failed", "send_failed");
  });

  it("after a crash mid-send, reports the text as failed instead of sending it again", async () => {
    const deps = setup();
    await deps.journal.write({ jobId: messageId, leaseToken, outcome: "pending" });
    expect(await createOutboxWorker(deps).runOnce()).toEqual({ result: "recovered" });
    expect(deps.api.finish).toHaveBeenCalledWith({ messageId, leaseToken }, "failed", "device_restarted");
    expect(deps.api.claim).not.toHaveBeenCalled();
    expect(deps.transport.send).not.toHaveBeenCalled();
  });

  it("does nothing when this phone may not send", async () => {
    const deps = setup();
    deps.canSend.mockReturnValue(false);
    expect((await createOutboxWorker(deps).runOnce()).result).toBe("unavailable");
    expect(deps.api.claim).not.toHaveBeenCalled();
  });
});

describe("nextOutboxAttemptAt", () => {
  it("leaves a gap between texts, follows the server's waits, and backs off on trouble", () => {
    expect(nextOutboxAttemptAt({ result: "sent" }, now)).toBe(now + 15_000);
    expect(nextOutboxAttemptAt({ result: "waiting", reason: "paced", retryAt: "2026-10-13T04:20:00Z" }, now)).toBe(Date.parse("2026-10-13T04:20:00Z"));
    // A wait already in the past means more texts are due: try again soon, not instantly.
    expect(nextOutboxAttemptAt({ result: "waiting", reason: "no_job", retryAt: "2026-10-13T03:00:00Z" }, now)).toBe(now + 15_000);
    // Nothing queued: the server plans every 5 minutes.
    expect(nextOutboxAttemptAt({ result: "waiting", reason: "no_job", retryAt: null }, now)).toBe(now + 60_000);
    expect(nextOutboxAttemptAt({ result: "waiting", reason: "quiet_hours", retryAt: null }, now)).toBe(now + 10 * 60_000);
    expect(nextOutboxAttemptAt({ result: "unavailable" }, now)).toBe(now + 60_000);
    // Never sleeps longer than 30 minutes on a far-away answer.
    expect(nextOutboxAttemptAt({ result: "waiting", reason: "daily_limit", retryAt: "2026-10-14T16:00:00Z" }, now)).toBe(now + 30 * 60_000);
  });
});
