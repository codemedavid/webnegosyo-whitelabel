/**
 * Which shift sales the screen shows, decided once from the two reads.
 *
 * The server report (the one sales definition) wins whenever it answers.
 * The tablet counts the shift itself only when the server cannot: a store
 * whose orders are not on the platform (`unavailable`), a database the
 * report function has not reached yet (`not_set_up`), or no connection —
 * and then the report says "Counted on this tablet". A refusal (42501) is
 * respected, never worked around with a device count. Nothing unknown is
 * ever drawn as ₱0. Pure.
 */

import type { ShiftSalesFetch, ShiftSalesReport } from "./shift-sales";

export type ServerSalesRead =
  /** Not asked: the store's orders are not on the platform, or a demo. */
  | { status: "skipped" }
  | { status: "loading" }
  | { status: "done"; fetch: ShiftSalesFetch }
  /** The read itself threw (offline, timed out before an answer). */
  | { status: "error"; message: string };

export type DeviceSalesRead =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: ShiftSalesReport }
  /** This tablet cannot count it honestly (too many orders, a ledger it could not read). */
  | { status: "unavailable"; reason: string };

export type ShiftSalesScreenState =
  | { kind: "loading" }
  | { kind: "ready"; report: ShiftSalesReport; notice: string | null }
  | { kind: "locked"; message: string }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; message: string };

export const DEVICE_AFTER_SERVER_FAILED_NOTICE = "The store's report didn't answer, so this was counted on this tablet.";

/** Whether the tablet must count the shift itself (and so read its orders). */
export function needsDeviceCount(server: ServerSalesRead): boolean {
  if (server.status === "skipped" || server.status === "error") return true;
  if (server.status !== "done") return false;
  if (server.fetch.ok) return server.fetch.reply.kind === "unavailable";
  return server.fetch.kind === "not_set_up" || server.fetch.kind === "failed";
}

function fromDevice(device: DeviceSalesRead, notice: string | null, failedMessage: string | null): ShiftSalesScreenState {
  if (device.status === "ready") return { kind: "ready", report: device.report, notice };
  if (device.status === "unavailable") {
    return failedMessage ? { kind: "error", message: failedMessage } : { kind: "unavailable", message: device.reason };
  }
  return { kind: "loading" };
}

export function resolveShiftSalesState(input: {
  sample: ShiftSalesReport | null;
  server: ServerSalesRead;
  device: DeviceSalesRead;
}): ShiftSalesScreenState {
  const { sample, server, device } = input;
  if (sample) return { kind: "ready", report: sample, notice: null };
  if (server.status === "loading") return { kind: "loading" };
  if (server.status === "skipped") return fromDevice(device, null, null);
  if (server.status === "error") return fromDevice(device, DEVICE_AFTER_SERVER_FAILED_NOTICE, server.message);

  const { fetch } = server;
  if (fetch.ok) {
    return fetch.reply.kind === "report"
      ? { kind: "ready", report: fetch.reply.report, notice: null }
      : fromDevice(device, null, null);
  }
  if (fetch.kind === "forbidden") return { kind: "locked", message: fetch.message };
  if (fetch.kind === "invalid") return { kind: "error", message: fetch.message };
  if (fetch.kind === "not_set_up") return fromDevice(device, null, null);
  return fromDevice(device, DEVICE_AFTER_SERVER_FAILED_NOTICE, fetch.message);
}
