import { executeRun } from "./send-run";
import type { SendRunDeps, SmsCustomer } from "./types";

function customer(id: string, overrides: Partial<SmsCustomer> = {}): SmsCustomer {
  return {
    id,
    name: `Guest ${id}`,
    phone_e164: `+6391700000${id}`,
    order_count: 2,
    total_spent: 500,
    last_order_at: "2026-07-01T02:00:00.000Z",
    channels_used: ["pickup"],
    sms_consent: true,
    sms_opt_out: false,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<SendRunDeps> = {}): jest.Mocked<SendRunDeps> {
  return {
    sendSms: jest.fn().mockResolvedValue(undefined),
    recordSend: jest.fn().mockResolvedValue(undefined),
    wait: jest.fn().mockResolvedValue(undefined),
    now: jest.fn().mockReturnValue("2026-08-16T02:00:00.000Z"),
    staggerMs: 2000,
    shouldAbort: jest.fn().mockReturnValue(false),
    ...overrides,
  } as jest.Mocked<SendRunDeps>;
}

const CONTEXT = { template: "Hi {{firstName}}!", storeName: "Aling Nena's" };

function codedError(code: string, message = "boom"): Error {
  return Object.assign(new Error(message), { code });
}

describe("executeRun — the happy path", () => {
  it("sends one rendered message per recipient", async () => {
    const deps = makeDeps();

    const outcome = await executeRun([customer("1"), customer("2")], CONTEXT, deps);

    expect(deps.sendSms).toHaveBeenNthCalledWith(1, "+639170000001", "Hi Guest!");
    expect(deps.sendSms).toHaveBeenCalledTimes(2);
    expect(outcome.sentCount).toBe(2);
    expect(outcome.haltedReason).toBeNull();
  });

  it("records every send, so a resumed run can skip it", async () => {
    const deps = makeDeps();

    await executeRun([customer("1")], CONTEXT, deps);

    expect(deps.recordSend).toHaveBeenCalledWith({
      customerId: "1",
      phoneE164: "+639170000001",
      messageBody: "Hi Guest!",
      result: "sent",
      sentAt: "2026-08-16T02:00:00.000Z",
    });
  });

  it("records the send only after the phone confirms it, never before", async () => {
    const order: string[] = [];
    const deps = makeDeps({
      sendSms: jest.fn().mockImplementation(async () => {
        order.push("send");
      }),
      recordSend: jest.fn().mockImplementation(async () => {
        order.push("record");
      }),
    });

    await executeRun([customer("1")], CONTEXT, deps);

    expect(order).toEqual(["send", "record"]);
  });

  it("staggers between messages but does not stall before the first", async () => {
    const deps = makeDeps();

    await executeRun([customer("1"), customer("2"), customer("3")], CONTEXT, deps);

    expect(deps.wait).toHaveBeenCalledTimes(2);
    expect(deps.wait).toHaveBeenCalledWith(2000);
  });

  it("does nothing at all for an empty batch", async () => {
    const deps = makeDeps();

    const outcome = await executeRun([], CONTEXT, deps);

    expect(deps.sendSms).not.toHaveBeenCalled();
    expect(outcome.sentCount).toBe(0);
    expect(outcome.haltedReason).toBeNull();
  });
});

describe("executeRun — one bad recipient must not sink the run", () => {
  it("records a failure and carries on when the phone rejects one number", async () => {
    const deps = makeDeps({
      sendSms: jest
        .fn()
        .mockRejectedValueOnce(codedError("GENERIC_FAILURE", "could not send"))
        .mockResolvedValue(undefined),
    });

    const outcome = await executeRun([customer("1"), customer("2")], CONTEXT, deps);

    expect(outcome.failedCount).toBe(1);
    expect(outcome.sentCount).toBe(1);
    expect(deps.recordSend).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "1",
        result: "failed",
        errorCode: "GENERIC_FAILURE",
        errorMessage: "could not send",
      })
    );
  });

  it("skips a recipient whose message cannot be rendered, without texting anyone wrong", async () => {
    const deps = makeDeps();

    const outcome = await executeRun([customer("1")], { ...CONTEXT, template: "Hi {{nope}}" }, deps);

    expect(deps.sendSms).not.toHaveBeenCalled();
    expect(outcome.failedCount).toBe(1);
    expect(deps.recordSend).toHaveBeenCalledWith(
      expect.objectContaining({ result: "failed", errorCode: "TEMPLATE_ERROR" })
    );
  });

  it("skips a recipient whose phone number went missing between planning and sending", async () => {
    const deps = makeDeps();

    const outcome = await executeRun([customer("1", { phone_e164: null })], CONTEXT, deps);

    expect(deps.sendSms).not.toHaveBeenCalled();
    expect(outcome.skippedCount).toBe(1);
  });

  it("labels an error with no code so the log is never blank", async () => {
    const deps = makeDeps({ sendSms: jest.fn().mockRejectedValue(new Error("plain failure")) });

    await executeRun([customer("1")], CONTEXT, deps);

    expect(deps.recordSend).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "UNKNOWN", errorMessage: "plain failure" })
    );
  });
});

describe("executeRun — halting", () => {
  it("stops the whole run when Android starts rate-limiting", async () => {
    const deps = makeDeps({
      sendSms: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(codedError("LIMIT_EXCEEDED", "too many")),
    });

    const outcome = await executeRun(
      [customer("1"), customer("2"), customer("3")],
      CONTEXT,
      deps
    );

    // The third is never attempted — burning through the cap would make every
    // remaining message fail and mark the whole audience as unreachable.
    expect(deps.sendSms).toHaveBeenCalledTimes(2);
    expect(outcome.haltedReason).toBe("rate_limited");
    expect(outcome.sentCount).toBe(1);
    expect(outcome.failedCount).toBe(1);
  });

  it("stops when the merchant cancels mid-run", async () => {
    const shouldAbort = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const deps = makeDeps({ shouldAbort });

    const outcome = await executeRun(
      [customer("1"), customer("2"), customer("3")],
      CONTEXT,
      deps
    );

    expect(deps.sendSms).toHaveBeenCalledTimes(1);
    expect(outcome.haltedReason).toBe("aborted");
  });

  it("stops when a send cannot be recorded — an unlogged send would be re-sent on resume", async () => {
    const deps = makeDeps({
      recordSend: jest.fn().mockRejectedValue(new Error("offline")),
    });

    const outcome = await executeRun([customer("1"), customer("2")], CONTEXT, deps);

    expect(deps.sendSms).toHaveBeenCalledTimes(1);
    expect(outcome.haltedReason).toBe("log_failed");
  });

  it("never throws, whatever the phone does", async () => {
    const deps = makeDeps({ sendSms: jest.fn().mockRejectedValue(codedError("RADIO_OFF")) });

    await expect(executeRun([customer("1")], CONTEXT, deps)).resolves.toBeDefined();
  });

  it("reports the per-recipient results in the order they were attempted", async () => {
    const deps = makeDeps({
      sendSms: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(codedError("NO_SERVICE")),
    });

    const outcome = await executeRun([customer("1"), customer("2")], CONTEXT, deps);

    expect(outcome.results.map((r) => [r.customerId, r.result])).toEqual([
      ["1", "sent"],
      ["2", "failed"],
    ]);
  });
});
