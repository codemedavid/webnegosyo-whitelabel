import {
  gatewayStatusText,
  parseGatewayTaskData,
  planGatewayEnable,
  resolveGatewayNative,
  runGatewayLoop,
  type GatewayStopReason,
} from "./sms-gateway";
import { LOYALTY_SMS_POLL_ACTIVE_MS, LOYALTY_SMS_POLL_BACKOFF_MS, type WorkerRunResult } from "./sms-delivery-mount";

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

describe("runGatewayLoop", () => {
  function harness(results: WorkerRunResult[], stopAfter: number, reason: GatewayStopReason = "stopped") {
    let checks = 0;
    const sleeps: number[] = [];
    const seen: WorkerRunResult[] = [];
    const runOnce = jest.fn(async () => results.shift() ?? "idle");
    const deps = {
      runOnce,
      check: jest.fn(async () => (++checks > stopAfter ? reason : null)),
      sleep: jest.fn(async (ms: number) => { sleeps.push(ms); }),
      onResult: (result: WorkerRunResult) => { seen.push(result); },
    };
    return { deps, sleeps, seen, runOnce };
  }

  test("polls quickly while healthy and backs off after a failure", async () => {
    const { deps, sleeps, seen } = harness(["sent", "unavailable", "idle"], 6);
    await runGatewayLoop(deps);
    expect(seen).toEqual(["sent", "unavailable", "idle"]);
    expect(sleeps).toEqual([LOYALTY_SMS_POLL_ACTIVE_MS, LOYALTY_SMS_POLL_BACKOFF_MS, LOYALTY_SMS_POLL_ACTIVE_MS]);
  });

  test("never polls once a stop condition is already true", async () => {
    const { deps, runOnce } = harness([], 0, "signed_out");
    expect(await runGatewayLoop(deps)).toBe("signed_out");
    expect(runOnce).not.toHaveBeenCalled();
  });

  test("stops right after a poll without sleeping first", async () => {
    const { deps, sleeps } = harness(["sent"], 1, "revoked");
    expect(await runGatewayLoop(deps)).toBe("revoked");
    expect(sleeps).toEqual([]);
  });

  test("a throwing poll is treated as unavailable, never as the end of the gateway", async () => {
    const { deps, seen, sleeps } = harness([], 4);
    deps.runOnce.mockRejectedValueOnce(new Error("boom"));
    await runGatewayLoop(deps);
    expect(seen[0]).toBe("unavailable");
    expect(sleeps[0]).toBe(LOYALTY_SMS_POLL_BACKOFF_MS);
  });
});

describe("gatewayStatusText", () => {
  test("idle gateway says it is ready", () => {
    expect(gatewayStatusText({ sentToday: 0, lastSentAt: null })).toBe("Ready to send reward codes");
  });
  test("counts codes with the last send time", () => {
    const at = new Date(2026, 9, 4, 15, 41).getTime();
    expect(gatewayStatusText({ sentToday: 1, lastSentAt: at })).toBe("1 code sent today · last at 3:41 PM");
    expect(gatewayStatusText({ sentToday: 3, lastSentAt: new Date(2026, 9, 4, 0, 5).getTime() }))
      .toBe("3 codes sent today · last at 12:05 AM");
  });
});

describe("planGatewayEnable", () => {
  const ready = {
    platform: "android",
    releaseEnabled: true,
    hasNativeGateway: true,
    isEnrolled: true,
    hasSmsPermission: true,
  };
  test("ready when every precondition holds", () => {
    expect(planGatewayEnable(ready)).toBe("ready");
  });
  test.each([
    ["unsupported", { platform: "ios" }],
    ["unsupported", { releaseEnabled: false }],
    ["update_app", { hasNativeGateway: false }],
    ["enroll", { isEnrolled: false }],
    ["sms_permission", { hasSmsPermission: false }],
  ])("asks for %s first", (step, patch) => {
    expect(planGatewayEnable({ ...ready, ...patch })).toBe(step);
  });
  test("an old binary is told to update before being asked to enroll", () => {
    expect(planGatewayEnable({ ...ready, hasNativeGateway: false, isEnrolled: false })).toBe("update_app");
  });
});

describe("resolveGatewayNative", () => {
  const complete = {
    sendSms: jest.fn(),
    startSmsGateway: jest.fn(),
    stopSmsGateway: jest.fn(),
    getSmsGatewayState: jest.fn(),
    setSmsGatewayStatus: jest.fn(),
    isIgnoringBatteryOptimizations: jest.fn(),
    requestIgnoreBatteryOptimizations: jest.fn(),
  };
  test("exposes a binary that ships every gateway function", () => {
    expect(resolveGatewayNative(complete)).toBe(complete);
  });
  test("an older binary (send-only) or iOS has no gateway", () => {
    expect(resolveGatewayNative(null)).toBeNull();
    expect(resolveGatewayNative({ sendSms: jest.fn() })).toBeNull();
    const partial: Partial<typeof complete> = { ...complete, stopSmsGateway: undefined };
    expect(resolveGatewayNative(partial)).toBeNull();
  });
});

describe("parseGatewayTaskData", () => {
  test("accepts exactly the tenant and actor the service was started with", () => {
    expect(parseGatewayTaskData({ tenantId, actorId })).toEqual({ tenantId, actorId });
  });
  test.each([
    [null],
    [{}],
    [{ tenantId }],
    [{ tenantId: "x", actorId }],
    [{ tenantId, actorId: 7 }],
  ])("refuses %p", (data) => {
    expect(parseGatewayTaskData(data)).toBeNull();
  });
});
