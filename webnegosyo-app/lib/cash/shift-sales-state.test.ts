import {
  DEVICE_AFTER_SERVER_FAILED_NOTICE,
  needsDeviceCount,
  resolveShiftSalesState,
  type DeviceSalesRead,
  type ServerSalesRead,
} from "./shift-sales-state";
import type { ShiftSalesReport } from "./shift-sales";

function report(source: ShiftSalesReport["source"]): ShiftSalesReport {
  return {
    source,
    hidden: false,
    window: { from: "a", to: "b" },
    shift: null,
    summary: null,
    payments: null,
    orderTypes: null,
    channels: null,
    items: null,
    receipts: [],
    receiptsTruncated: false,
    firstNumber: null,
    lastNumber: null,
  };
}

const serverReport: ServerSalesRead = { status: "done", fetch: { ok: true, reply: { kind: "report", report: report("server") } } };
const unavailable: ServerSalesRead = { status: "done", fetch: { ok: true, reply: { kind: "unavailable" } } };
const deviceReady: DeviceSalesRead = { status: "ready", report: report("device") };

describe("resolveShiftSalesState", () => {
  it("shows the demo's sample whatever the reads say", () => {
    const state = resolveShiftSalesState({ sample: report("sample"), server: { status: "loading" }, device: { status: "idle" } });
    expect(state).toMatchObject({ kind: "ready", report: { source: "sample" } });
  });

  it("prefers the server report, never the tablet's count", () => {
    expect(resolveShiftSalesState({ sample: null, server: serverReport, device: deviceReady })).toMatchObject({
      kind: "ready",
      report: { source: "server" },
      notice: null,
    });
  });

  it("counts on the tablet for a store whose orders are not on the platform", () => {
    expect(resolveShiftSalesState({ sample: null, server: unavailable, device: deviceReady })).toMatchObject({
      kind: "ready",
      report: { source: "device" },
    });
    expect(resolveShiftSalesState({ sample: null, server: { status: "skipped" }, device: deviceReady })).toMatchObject({
      report: { source: "device" },
    });
  });

  it("counts on the tablet while the report function is not on this database yet", () => {
    const notSetUp: ServerSalesRead = { status: "done", fetch: { ok: false, kind: "not_set_up", message: "x" } };
    expect(resolveShiftSalesState({ sample: null, server: notSetUp, device: deviceReady })).toMatchObject({ kind: "ready" });
  });

  it("respects a refusal instead of counting around it", () => {
    const refused: ServerSalesRead = { status: "done", fetch: { ok: false, kind: "forbidden", message: "Not yours" } };
    expect(resolveShiftSalesState({ sample: null, server: refused, device: deviceReady })).toEqual({ kind: "locked", message: "Not yours" });
    expect(needsDeviceCount(refused)).toBe(false);
  });

  it("falls back to the tablet when the server could not be reached, and says so", () => {
    const offline: ServerSalesRead = { status: "error", message: "Offline" };
    expect(resolveShiftSalesState({ sample: null, server: offline, device: deviceReady })).toEqual({
      kind: "ready",
      report: report("device"),
      notice: DEVICE_AFTER_SERVER_FAILED_NOTICE,
    });
  });

  it("shows the error (with Retry) when neither read can answer", () => {
    const offline: ServerSalesRead = { status: "error", message: "Offline" };
    expect(
      resolveShiftSalesState({ sample: null, server: offline, device: { status: "unavailable", reason: "Too many" } }),
    ).toEqual({ kind: "error", message: "Offline" });
  });

  it("says why the tablet cannot count it rather than drawing ₱0", () => {
    expect(
      resolveShiftSalesState({ sample: null, server: unavailable, device: { status: "unavailable", reason: "Too many orders" } }),
    ).toEqual({ kind: "unavailable", message: "Too many orders" });
  });

  it("stays loading while either read it depends on is still on its way", () => {
    expect(resolveShiftSalesState({ sample: null, server: { status: "loading" }, device: deviceReady }).kind).toBe("loading");
    expect(resolveShiftSalesState({ sample: null, server: unavailable, device: { status: "loading" } }).kind).toBe("loading");
  });

  it("reads the tablet's orders only when the server cannot answer", () => {
    expect(needsDeviceCount(serverReport)).toBe(false);
    expect(needsDeviceCount({ status: "loading" })).toBe(false);
    expect(needsDeviceCount(unavailable)).toBe(true);
    expect(needsDeviceCount({ status: "skipped" })).toBe(true);
    expect(needsDeviceCount({ status: "error", message: "x" })).toBe(true);
  });
});
