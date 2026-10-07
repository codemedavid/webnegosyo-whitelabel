import { createGatewayTask, GATEWAY_TROUBLE_TEXT, type GatewayTaskDeps } from "./sms-gateway-task";
import type { WorkerRunResult } from "./sms-delivery-mount";

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const enrollment = { deviceId: "33333333-3333-4333-8333-333333333333", credential: "A".repeat(43) };

type WorkerArgs = Parameters<GatewayTaskDeps["createWorker"]>;

function setup(overrides: Partial<GatewayTaskDeps> = {}, results: WorkerRunResult[] = []) {
  let polls = 0;
  const workerCalls: WorkerArgs[] = [];
  const deps: GatewayTaskDeps = {
    readEnrollment: jest.fn(async () => enrollment),
    clearEnrollment: jest.fn(async () => undefined),
    currentUserId: jest.fn(async () => actorId),
    isReleaseEnabled: jest.fn(() => true),
    isGatewayEnabled: jest.fn(async () => polls < 3),
    createWorker: jest.fn((...args: WorkerArgs) => {
      workerCalls.push(args);
      return { runOnce: jest.fn(async () => { polls++; return results.shift() ?? "idle"; }) };
    }),
    sleep: jest.fn(async () => undefined),
    setStatus: jest.fn(),
    stopService: jest.fn(async () => undefined),
    now: () => new Date(2026, 9, 4, 9, 30).getTime(),
    ...overrides,
  };
  return { deps, workerCalls, task: createGatewayTask(deps) };
}

test("runs the worker for the started tenant and actor until the merchant turns it off", async () => {
  const { deps, workerCalls, task } = setup();
  await task({ tenantId, actorId });
  expect(workerCalls).toHaveLength(1);
  expect(workerCalls[0][0]).toEqual({ tenantId, actorId });
  expect(workerCalls[0][1]).toEqual(enrollment);
  expect(deps.stopService).toHaveBeenCalledTimes(1);
});

test("malformed task data stops the service without building a worker", async () => {
  const { deps, task } = setup();
  await task({ tenantId: "nope" });
  expect(deps.createWorker).not.toHaveBeenCalled();
  expect(deps.stopService).toHaveBeenCalled();
});

test("a phone that is no longer enrolled stops instead of polling", async () => {
  const { deps, task } = setup({ readEnrollment: jest.fn(async () => null) });
  await task({ tenantId, actorId });
  expect(deps.createWorker).not.toHaveBeenCalled();
  expect(deps.stopService).toHaveBeenCalled();
});

test("signing out (or a different account) ends the gateway", async () => {
  for (const user of [null, "99999999-9999-4999-8999-999999999999"]) {
    const { deps, task } = setup({ currentUserId: jest.fn(async () => user), isGatewayEnabled: jest.fn(async () => true) });
    await task({ tenantId, actorId });
    expect(deps.stopService).toHaveBeenCalled();
  }
});

test("an unreadable session (offline, slow refresh) is not a sign-out", async () => {
  let reads = 0;
  const { deps, task } = setup({
    currentUserId: jest.fn(async () => {
      reads++;
      if (reads === 1) throw new Error("timeout");
      return actorId;
    }),
  });
  await task({ tenantId, actorId });
  expect((deps.createWorker as jest.Mock).mock.results[0].value.runOnce).toHaveBeenCalled();
});

test("revocation forgets this phone's credential and stops", async () => {
  const { deps, workerCalls, task } = setup({ isGatewayEnabled: jest.fn(async () => true) });
  const run = task({ tenantId, actorId });
  await Promise.resolve();
  await Promise.resolve();
  const onRevoked = workerCalls[0][3];
  const canSend = workerCalls[0][2];
  expect(canSend()).toBe(true);
  onRevoked();
  expect(canSend()).toBe(false);
  await run;
  expect(deps.clearEnrollment).toHaveBeenCalledWith({ tenantId, actorId }, enrollment);
  expect(deps.stopService).toHaveBeenCalled();
});

test("the release gate closing stops the gateway and refuses further sends", async () => {
  let open = true;
  const { deps, workerCalls, task } = setup({ isReleaseEnabled: jest.fn(() => open), isGatewayEnabled: jest.fn(async () => true) });
  const run = task({ tenantId, actorId });
  await Promise.resolve();
  await Promise.resolve();
  open = false;
  expect(workerCalls[0][2]()).toBe(false);
  await run;
  expect(deps.stopService).toHaveBeenCalled();
});

test("each sent code updates the persistent notification", async () => {
  const { deps, task } = setup({}, ["sent", "idle", "sent"]);
  await task({ tenantId, actorId });
  expect(deps.setStatus).toHaveBeenCalledWith("Ready to send reward codes");
  expect(deps.setStatus).toHaveBeenLastCalledWith("2 codes sent today · last at 9:30 AM");
});

test("a restarted gateway supersedes the old loop, which exits without stopping the new service", async () => {
  let releaseFirst: () => void = () => undefined;
  const sleeps: Array<() => void> = [];
  const { deps, workerCalls, task } = setup({
    isGatewayEnabled: jest.fn(async () => true),
    sleep: jest.fn(() => new Promise<void>((resolve) => { sleeps.push(resolve); })),
  });
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  const first = task({ tenantId, actorId });
  await settle();
  expect(sleeps).toHaveLength(1);
  releaseFirst = sleeps.shift() ?? releaseFirst;
  const second = task({ tenantId, actorId });
  await settle();
  expect(sleeps).toHaveLength(1);
  const oldCanSend = workerCalls[0][2];
  expect(oldCanSend()).toBe(false);
  expect(workerCalls[1][2]()).toBe(true);
  releaseFirst();
  expect(await first).toBe("superseded");
  expect(deps.stopService).not.toHaveBeenCalled();
  (deps.isGatewayEnabled as jest.Mock).mockResolvedValue(false);
  sleeps.shift()?.();
  await settle();
  expect(await second).toBe("stopped");
  expect(deps.stopService).toHaveBeenCalledTimes(1);
});

test("a new run never polls while the superseded run's poll is still in flight", async () => {
  let finishFirstPoll: () => void = () => undefined;
  let polling = 0;
  let overlapped = false;
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
  // First run: its poll hangs until released.
  const slow = jest.fn(() => new Promise<WorkerRunResult>((resolve) => {
    polling++;
    finishFirstPoll = () => { polling--; resolve("idle"); };
  }));
  const fast = jest.fn(async () => {
    if (polling > 0) overlapped = true;
    return "idle" as const;
  });
  let made = 0;
  const custom = setup({
    isGatewayEnabled: jest.fn(async () => true),
    createWorker: jest.fn(() => ({ runOnce: made++ === 0 ? slow : fast })),
    // A real macrotask between polls, or the released run spins on microtasks
    // and starves this test's setImmediate.
    sleep: jest.fn(() => new Promise<void>((resolve) => setImmediate(resolve))),
  });
  const first = custom.task({ tenantId, actorId });
  await settle();
  expect(slow).toHaveBeenCalledTimes(1);
  const second = custom.task({ tenantId, actorId });
  await settle();
  expect(fast).not.toHaveBeenCalled();
  finishFirstPoll();
  await settle();
  expect(await first).toBe("superseded");
  expect(fast).toHaveBeenCalled();
  expect(overlapped).toBe(false);
  (custom.deps.isGatewayEnabled as jest.Mock).mockResolvedValue(false);
  await settle();
  await second;
});

test("repeated failures change the notification so a stuck gateway is visible", async () => {
  const { deps, task } = setup({}, ["unavailable", "unavailable", "unavailable"]);
  (deps.isGatewayEnabled as jest.Mock).mockImplementation(async () => (deps.setStatus as jest.Mock).mock.calls.length < 2);
  await task({ tenantId, actorId });
  expect(deps.setStatus).toHaveBeenLastCalledWith(GATEWAY_TROUBLE_TEXT);
});

test("a healthy poll after trouble restores the normal text", async () => {
  const { deps, task } = setup({}, ["unavailable", "unavailable", "unavailable", "idle"]);
  let polls = 0;
  (deps.isGatewayEnabled as jest.Mock).mockImplementation(async () => polls++ < 8);
  await task({ tenantId, actorId });
  expect(deps.setStatus).toHaveBeenLastCalledWith("Ready to send reward codes");
});
