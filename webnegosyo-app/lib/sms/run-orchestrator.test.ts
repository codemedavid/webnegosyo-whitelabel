import { orchestrateRun } from "./run-orchestrator";
import type { OrchestrateRunDeps, OrchestrateRunInput } from "./run-orchestrator";
import type { RunOutcome, SmsCustomer } from "./types";

function customer(id: string): SmsCustomer {
  return {
    id,
    name: `Guest ${id}`,
    phone_e164: `+6391700000${id}`,
    order_count: 1,
    total_spent: 100,
    last_order_at: "2026-07-01T02:00:00.000Z",
    channels_used: ["pickup"],
    sms_consent: true,
    sms_opt_out: false,
  };
}

function outcome(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    results: [],
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    haltedReason: null,
    ...overrides,
  };
}

function input(overrides: Partial<OrchestrateRunInput> = {}): OrchestrateRunInput {
  return {
    runId: "run-1",
    deviceId: "device-A",
    template: "Hi {{firstName}}!",
    storeName: "Aling Nena's",
    maxPerRun: 25,
    audience: [customer("1"), customer("2"), customer("3")],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<OrchestrateRunDeps> = {}): jest.Mocked<OrchestrateRunDeps> {
  return {
    claimRun: jest.fn().mockResolvedValue(true),
    listSentCustomerIds: jest.fn().mockResolvedValue([]),
    execute: jest.fn().mockResolvedValue(outcome({ sentCount: 3 })),
    finishRun: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<OrchestrateRunDeps>;
}

describe("orchestrateRun — claiming", () => {
  it("claims the run before sending anything", async () => {
    const order: string[] = [];
    const deps = makeDeps({
      claimRun: jest.fn().mockImplementation(async () => {
        order.push("claim");
        return true;
      }),
      execute: jest.fn().mockImplementation(async () => {
        order.push("execute");
        return outcome();
      }),
    });

    await orchestrateRun(input(), deps);

    expect(order).toEqual(["claim", "execute"]);
  });

  it("sends nothing when another device already holds the run", async () => {
    // Two phones signed into the same store both see the run come due. Only
    // one may send it, or every guest gets the message twice.
    const deps = makeDeps({ claimRun: jest.fn().mockResolvedValue(false) });

    const result = await orchestrateRun(input(), deps);

    expect(deps.execute).not.toHaveBeenCalled();
    expect(result.status).toBe("claimed_elsewhere");
  });

  it("does not mark the run finished when it could not claim it", async () => {
    const deps = makeDeps({ claimRun: jest.fn().mockResolvedValue(false) });

    await orchestrateRun(input(), deps);

    expect(deps.finishRun).not.toHaveBeenCalled();
  });
});

describe("orchestrateRun — resuming", () => {
  it("skips customers already recorded against this run", async () => {
    const deps = makeDeps({
      listSentCustomerIds: jest.fn().mockResolvedValue(["1"]),
      execute: jest.fn().mockResolvedValue(outcome({ sentCount: 2 })),
    });

    await orchestrateRun(input(), deps);

    const [batch] = deps.execute.mock.calls[0];
    expect((batch as SmsCustomer[]).map((c) => c.id)).toEqual(["2", "3"]);
  });

  it("finishes immediately, without sending, when everyone already got it", async () => {
    const deps = makeDeps({
      listSentCustomerIds: jest.fn().mockResolvedValue(["1", "2", "3"]),
    });

    const result = await orchestrateRun(input(), deps);

    expect(deps.execute).not.toHaveBeenCalled();
    expect(result.status).toBe("completed");
    expect(deps.finishRun).toHaveBeenCalledWith("run-1", "completed");
  });

  it("caps the batch and reports the run as partial when work remains", async () => {
    const deps = makeDeps({
      execute: jest.fn().mockResolvedValue(outcome({ sentCount: 2 })),
    });

    const result = await orchestrateRun(input({ maxPerRun: 2 }), deps);

    const [batch] = deps.execute.mock.calls[0];
    expect(batch).toHaveLength(2);
    expect(result.status).toBe("partial");
    expect(result.remainingCount).toBe(1);
  });
});

describe("orchestrateRun — finishing", () => {
  it("marks a fully-worked run completed", async () => {
    const deps = makeDeps();

    const result = await orchestrateRun(input(), deps);

    expect(result.status).toBe("completed");
    expect(deps.finishRun).toHaveBeenCalledWith("run-1", "completed");
  });

  it("does NOT mark the run completed when Android rate-limited it", async () => {
    // Completing here would retire the run and strand everyone it never
    // reached; the campaign must be able to pick this up again later.
    const deps = makeDeps({
      execute: jest.fn().mockResolvedValue(
        outcome({ sentCount: 1, failedCount: 1, haltedReason: "rate_limited" })
      ),
    });

    const result = await orchestrateRun(input(), deps);

    expect(result.status).toBe("halted");
    expect(deps.finishRun).not.toHaveBeenCalledWith("run-1", "completed");
  });

  it("does NOT mark the run completed when the merchant cancelled it", async () => {
    const deps = makeDeps({
      execute: jest.fn().mockResolvedValue(outcome({ haltedReason: "aborted" })),
    });

    const result = await orchestrateRun(input(), deps);

    expect(result.status).toBe("halted");
  });

  it("does NOT mark the run completed when a send could not be logged", async () => {
    const deps = makeDeps({
      execute: jest.fn().mockResolvedValue(outcome({ haltedReason: "log_failed" })),
    });

    expect((await orchestrateRun(input(), deps)).status).toBe("halted");
  });

  it("surfaces the halt reason so the screen can explain it", async () => {
    const deps = makeDeps({
      execute: jest.fn().mockResolvedValue(outcome({ haltedReason: "rate_limited" })),
    });

    expect((await orchestrateRun(input(), deps)).haltedReason).toBe("rate_limited");
  });

  it("reports the counts the run actually achieved", async () => {
    const deps = makeDeps({
      execute: jest.fn().mockResolvedValue(
        outcome({ sentCount: 2, failedCount: 1, skippedCount: 0 })
      ),
    });

    const result = await orchestrateRun(input(), deps);

    expect(result.sentCount).toBe(2);
    expect(result.failedCount).toBe(1);
  });
});

describe("orchestrateRun — an empty audience", () => {
  it("completes without sending when nobody is reachable", async () => {
    // The normal case today: zero customers carry sms_consent, so a campaign
    // that comes due must finish cleanly rather than look stuck.
    const deps = makeDeps();

    const result = await orchestrateRun(input({ audience: [] }), deps);

    expect(deps.execute).not.toHaveBeenCalled();
    expect(result.status).toBe("completed");
    expect(result.sentCount).toBe(0);
  });
});
