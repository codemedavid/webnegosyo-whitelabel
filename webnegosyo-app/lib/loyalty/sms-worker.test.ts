import { createLoyaltySmsWorker } from "./sms-worker";
import { createLoyaltySmsTransport } from "./sms-transport";
import { createSmsDeliveryJournal } from "./sms-journal";

const jobId = "11111111-1111-1111-1111-111111111111";
const leaseToken = "22222222-2222-2222-2222-222222222222";
const now = Date.parse("2026-09-09T12:00:00Z");
const lease = { jobId, leaseToken, leaseExpiresAt: "2026-09-09T12:00:30Z" };
const grant = {
  jobId,
  leaseToken,
  phone: "+639171234567",
  code: "012345",
  expiresAt: "2026-09-09T12:05:00Z",
};
function setup() {
  const api = {
    claim: jest.fn().mockResolvedValue(lease),
    authorize: jest.fn().mockResolvedValue(grant),
    finish: jest.fn().mockResolvedValue(true),
    recover: jest.fn().mockResolvedValue(true),
  };
  const transport = {
    isAvailable: true,
    prepare: jest.fn().mockResolvedValue(true),
    send: jest.fn().mockResolvedValue(undefined),
  };
  const canSend = jest.fn().mockReturnValue(true);
  const rows = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => rows.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      rows.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      rows.delete(key);
    }),
  };
  const journal = createSmsDeliveryJournal(storage, {
    tenantId: jobId,
    actorId: leaseToken,
    deviceId: jobId,
  });
  return { api, transport, canSend, now: () => now, journal, storage };
}

test("sends one authorized OTP and acknowledges without exposing its content", async () => {
  const deps = setup();
  const worker = createLoyaltySmsWorker(deps);
  expect(await worker.runOnce()).toBe("sent");
  expect(deps.api.authorize).toHaveBeenCalledWith({ jobId, leaseToken });
  expect(deps.transport.send).toHaveBeenCalledWith(
    grant.phone,
    "Your loyalty verification code is 012345. Do not share this code.",
    expect.any(Function),
  );
  expect(deps.api.finish).toHaveBeenCalledWith({ jobId, leaseToken }, "sent");
});

test("unsupported or inactive sessions never claim a job", async () => {
  const deps = setup();
  deps.transport.isAvailable = false;
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("unavailable");
  expect(deps.api.claim).not.toHaveBeenCalled();
  deps.transport.isAvailable = true;
  deps.canSend.mockReturnValue(false);
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("unavailable");
  expect(deps.api.claim).not.toHaveBeenCalled();
});

test("an ambiguous native send is never retried", async () => {
  const deps = setup();
  deps.transport.send.mockRejectedValue(
    new Error("private phone or carrier detail"),
  );
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("uncertain");
  expect(deps.transport.send).toHaveBeenCalledTimes(1);
  expect(deps.api.finish).toHaveBeenCalledWith({ jobId, leaseToken }, "failed");
});

test("retries only the completion acknowledgement after a successful send", async () => {
  const deps = setup();
  deps.api.finish.mockRejectedValueOnce(new Error("lost ACK"));
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("sent");
  expect(deps.transport.send).toHaveBeenCalledTimes(1);
  expect(deps.api.finish).toHaveBeenCalledTimes(2);
  expect(deps.api.finish.mock.calls[0]).toEqual(deps.api.finish.mock.calls[1]);
});

test("reports uncertainty without reauthorizing if dispatch response is lost", async () => {
  const deps = setup();
  deps.api.authorize.mockRejectedValue(new Error("lost grant"));
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("uncertain");
  expect(deps.api.authorize).toHaveBeenCalledTimes(1);
  expect(deps.transport.send).not.toHaveBeenCalled();
});

test.each([
  { phone: "09171234567" },
  { code: "12345" },
  { code: "123456\n" },
  { expiresAt: "invalid" },
  { expiresAt: "2026-09-09T12:00:03Z" },
  { jobId: leaseToken },
])(
  "refuses malformed, mismatched, or almost-expired grants %#",
  async (patch) => {
    const deps = setup();
    deps.api.authorize.mockResolvedValue({ ...grant, ...patch });
    expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("unavailable");
    expect(deps.transport.send).not.toHaveBeenCalled();
  },
);

test("backgrounding after authorization prevents sending", async () => {
  const deps = setup();
  deps.api.authorize.mockImplementation(async () => {
    deps.canSend.mockReturnValue(false);
    return grant;
  });
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("unavailable");
  expect(deps.transport.send).not.toHaveBeenCalled();
});

test("overlapping polls cannot send concurrently and failed polling releases the guard", async () => {
  const deps = setup();
  let rejectClaim!: (error: Error) => void;
  let started!: () => void;
  const claimStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  deps.api.claim.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectClaim = reject;
        started();
      }),
  );
  const worker = createLoyaltySmsWorker(deps);
  const pending = worker.runOnce();
  expect(await worker.runOnce()).toBe("busy");
  await claimStarted;
  rejectClaim(new Error("offline"));
  expect(await pending).toBe("unavailable");
  expect(await worker.runOnce()).toBe("sent");
});

test("expired leases do not request a dispatch grant", async () => {
  const deps = setup();
  deps.api.claim.mockResolvedValue({
    ...lease,
    leaseExpiresAt: "2026-09-09T11:59:59Z",
  });
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("unavailable");
  expect(deps.api.authorize).not.toHaveBeenCalled();
});

test("rechecks expiry after the native permission check resolves", async () => {
  const deps = setup();
  let current = now;
  const native = { sendSms: jest.fn().mockResolvedValue(undefined) };
  const permissions = {
    check: jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(async () => {
        current += 300_000;
        return true;
      }),
    request: jest.fn().mockResolvedValue("granted"),
  };
  const transport = createLoyaltySmsTransport({
    platform: "android",
    native,
    permissions,
  });
  expect(
    await createLoyaltySmsWorker({
      ...deps,
      transport,
      now: () => current,
    }).runOnce(),
  ).toBe("uncertain");
  expect(native.sendSms).not.toHaveBeenCalled();
  expect(permissions.request).not.toHaveBeenCalled();
  expect(deps.api.finish).toHaveBeenCalledWith({ jobId, leaseToken }, "failed");
});

test("exhausted completion retries report sent-unconfirmed without sending again", async () => {
  const deps = setup();
  deps.api.finish.mockRejectedValue(new Error("offline"));
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("sent_unconfirmed");
  expect(deps.api.finish).toHaveBeenCalledTimes(2);
  expect(deps.transport.send).toHaveBeenCalledTimes(1);
});

test("restart replays a recorded acknowledgement without claiming or sending", async () => {
  const deps = setup();
  await deps.journal.write({ jobId, leaseToken, outcome: "sent" });
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("recovered");
  expect(deps.api.recover).toHaveBeenCalledWith({ jobId, leaseToken }, "sent");
  expect(deps.api.claim).not.toHaveBeenCalled();
  expect(deps.transport.send).not.toHaveBeenCalled();
  expect(await deps.journal.read()).toBeNull();
});

test("writes uncertainty before native send and known outcome before acknowledging", async () => {
  const deps = setup();
  deps.transport.send.mockImplementation(async () => {
    expect(await deps.journal.read()).toEqual({
      jobId,
      leaseToken,
      outcome: "pending",
    });
  });
  deps.api.finish.mockImplementation(async () => {
    expect(await deps.journal.read()).toEqual({
      jobId,
      leaseToken,
      outcome: "sent",
    });
    return true;
  });
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("sent");
  expect(await deps.journal.read()).toBeNull();
});

test("failed persistence prevents native send", async () => {
  const deps = setup();
  deps.storage.setItem.mockRejectedValue(new Error("disk full"));
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("unavailable");
  expect(deps.transport.send).not.toHaveBeenCalled();
});

test("an unknown pre-crash result is finalized as failed, never replayed", async () => {
  const deps = setup();
  await deps.journal.write({ jobId, leaseToken, outcome: "pending" });
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("recovered");
  expect(deps.api.recover).toHaveBeenCalledWith(
    { jobId, leaseToken },
    "failed",
  );
  expect(deps.api.claim).not.toHaveBeenCalled();
  expect(deps.transport.send).not.toHaveBeenCalled();
});

test("a rejected recovery retains the journal and blocks new dispatch", async () => {
  const deps = setup();
  await deps.journal.write({ jobId, leaseToken, outcome: "sent" });
  deps.api.recover.mockResolvedValue(false);
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe(
    "recovery_required",
  );
  expect(await deps.journal.read()).toEqual({
    jobId,
    leaseToken,
    outcome: "sent",
  });
  expect(deps.api.claim).not.toHaveBeenCalled();
});

test("a restart recovers a lost completion without another native send", async () => {
  const deps = setup();
  deps.api.finish.mockRejectedValue(new Error("offline"));
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("sent_unconfirmed");
  deps.api.finish.mockResolvedValue(true);
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("recovered");
  expect(deps.api.claim).toHaveBeenCalledTimes(1);
  expect(deps.transport.send).toHaveBeenCalledTimes(1);
  expect(await deps.journal.read()).toBeNull();
});

test("a failed journal cleanup retries only acknowledgement on restart", async () => {
  const deps = setup();
  deps.storage.removeItem.mockRejectedValueOnce(
    new Error("storage unavailable"),
  );
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("unavailable");
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("recovered");
  expect(deps.transport.send).toHaveBeenCalledTimes(1);
});

test("lost authorization and completion responses retain durable recovery intent", async () => {
  const deps = setup();
  deps.api.authorize.mockImplementation(async () => {
    expect(await deps.journal.read()).toEqual({
      jobId,
      leaseToken,
      outcome: "pending",
    });
    throw new Error("lost response");
  });
  deps.api.finish.mockRejectedValue(new Error("offline"));
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("uncertain");
  expect(await deps.journal.read()).toEqual({
    jobId,
    leaseToken,
    outcome: "failed",
  });
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("recovered");
  expect(deps.api.authorize).toHaveBeenCalledTimes(1);
  expect(deps.transport.send).not.toHaveBeenCalled();
});

test("failure to persist a successful send leaves uncertainty, not a repeatable send", async () => {
  const deps = setup();
  deps.transport.send.mockImplementation(async () => {
    deps.storage.setItem.mockRejectedValueOnce(new Error("disk full"));
  });
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("unavailable");
  expect(await deps.journal.read()).toEqual({
    jobId,
    leaseToken,
    outcome: "pending",
  });
  expect(deps.api.finish).not.toHaveBeenCalled();
  expect(await createLoyaltySmsWorker(deps).runOnce()).toBe("recovered");
  expect(deps.api.recover).toHaveBeenCalledWith(
    { jobId, leaseToken },
    "failed",
  );
  expect(deps.transport.send).toHaveBeenCalledTimes(1);
});
