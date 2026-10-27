/**
 * The shift's money RPCs: the server counts, reveals and closes; the tablet
 * only reports what it was told. A malformed reply is a failure, never ₱0;
 * a refusal carries the cashier-facing sentence for what was refused.
 */

jest.mock("../supabase", () => ({ supabase: { rpc: jest.fn() } }));

import {
  CASH_COPY,
  closeShiftRpc,
  countShift,
  openShiftRpc,
  parseClosePreview,
  parseCountResult,
  previewShiftClose,
  recordCashPickup,
  type CashRpcClient,
} from "./shift-close";

function answering(reply: { data: unknown; error: { code?: string; message?: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: CashRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve(reply);
    },
  };
  return { client, calls };
}

const PREVIEW = {
  source: "server",
  hidden: false,
  expectedCents: 846500,
  breakdown: [{ key: "float", label: "Starting cash", cents: 200000 }],
  nonCashByMethod: [{ key: "gcash", label: "GCash", cents: 421000, count: 14 }],
  floatCents: 200000,
  isZeroBalance: false,
  countAttempts: 0,
};

describe("parseClosePreview", () => {
  it("reads the server's expected figure and the non-cash to check", () => {
    expect(parseClosePreview(PREVIEW)).toEqual(PREVIEW);
  });

  it("keeps expected unknown while blind and uncounted", () => {
    const preview = parseClosePreview({ ...PREVIEW, hidden: true, expectedCents: null, breakdown: null });
    expect(preview.expectedCents).toBeNull();
    expect(preview.hidden).toBe(true);
  });

  it("refuses a figure that is not whole centavos", () => {
    expect(() => parseClosePreview({ ...PREVIEW, expectedCents: 12.5 })).toThrow(/expectedCents/);
  });
});

describe("parseCountResult", () => {
  it("accepts attempts 1 and 2 only", () => {
    const base = { attempt: 1, countedCents: 834500, expectedCents: 846500, differenceCents: -12000, source: "server", reasonRequired: true };
    expect(parseCountResult(base).differenceCents).toBe(-12000);
    expect(parseCountResult({ ...base, attempt: 2 }).attempt).toBe(2);
    expect(() => parseCountResult({ ...base, attempt: 3 })).toThrow();
  });
});

describe("calls", () => {
  it("previews one shift's close", async () => {
    const { client, calls } = answering({ data: PREVIEW, error: null });
    const result = await previewShiftClose("s1", client);
    expect(calls).toEqual([{ fn: "preview_shift_close", args: { p_shift_id: "s1" } }]);
    expect(result.ok).toBe(true);
  });

  it("sends a count with its denominations and the tablet's own expected figure", async () => {
    const { client, calls } = answering({
      data: { attempt: 1, countedCents: 100, expectedCents: 100, differenceCents: 0, source: "server", reasonRequired: false },
      error: null,
    });
    await countShift({ shiftId: "s1", countedCents: 100, denominations: { b100: 1 }, deviceExpectedCents: 100 }, client);
    expect(calls[0]).toEqual({
      fn: "count_shift",
      args: { p_shift_id: "s1", p_counted_cents: 100, p_denominations: { b100: 1 }, p_device_expected_cents: 100 },
    });
  });

  it("words a second recount as the limit it is", async () => {
    const { client } = answering({ data: null, error: { code: "22023", message: "recount_limit" } });
    expect(await countShift({ shiftId: "s1", countedCents: 1, denominations: null, deviceExpectedCents: null }, client)).toEqual({
      ok: false,
      kind: "refused",
      refusal: "recount_limit",
      message: CASH_COPY.recountLimit,
    });
  });

  it("words a close without a reason above the threshold", async () => {
    const { client } = answering({ data: null, error: { code: "22023", message: "variance_reason_required" } });
    const result = await closeShiftRpc(
      { shiftId: "s1", nonCash: [], varianceReason: null, note: null, floatKeptCents: 0, remitTo: null, remitToSafe: false, closedByName: "Ana" },
      client,
    );
    expect(result).toMatchObject({ ok: false, refusal: "variance_reason_required", message: CASH_COPY.reasonRequired });
  });

  it("closes with the non-cash answers, reason, float kept and receiver", async () => {
    const { client, calls } = answering({
      data: { closedAt: "2026-10-24T18:48:00Z", countedCents: 834500, expectedCents: 846500, differenceCents: -12000, remittanceId: "r1", handedOverCents: 634500 },
      error: null,
    });
    const result = await closeShiftRpc(
      {
        shiftId: "s1",
        nonCash: [{ key: "gcash", method: "GCash", expectedCents: 421000, slipCount: 14, check: "matches", declaredCents: 421000, note: null }],
        varianceReason: "wrong_change",
        note: "gave ₱100 extra to T4",
        floatKeptCents: 200000,
        remitTo: "u-maria",
        remitToSafe: false,
        closedByName: "Ana",
      },
      client,
    );
    expect(calls[0].fn).toBe("close_shift");
    expect(calls[0].args.p_non_cash).toEqual([
      { key: "gcash", method: "GCash", expectedCents: 421000, slipCount: 14, check: "matches", declaredCents: 421000, note: null },
    ]);
    expect(calls[0].args).toMatchObject({ p_variance_reason: "wrong_change", p_float_kept_cents: 200000, p_remit_to: "u-maria", p_remit_to_safe: false });
    expect(result).toMatchObject({ ok: true, data: { remittanceId: "r1", handedOverCents: 634500 } });
  });

  it("words the server's other refusals: bills required, figure missing, already closed", async () => {
    const answer = async (code: string, message: string) =>
      countShift({ shiftId: "s1", countedCents: 1, denominations: null, deviceExpectedCents: null }, answering({ data: null, error: { code, message } }).client);
    expect(await answer("22023", "denominations_required: this store counts bills")).toMatchObject({ refusal: "denominations_required", message: CASH_COPY.denominationsRequired });
    expect(await answer("22023", "expected_unavailable: the register's figure is missing")).toMatchObject({ refusal: "expected_unavailable" });
    expect(await answer("P0002", "shift_not_open: this shift is already closed.")).toMatchObject({ refusal: "not_open", message: CASH_COPY.notOpen });
    expect(await answer("55000", "This shift is already closed.")).toMatchObject({ kind: "refused", refusal: "other", message: "This shift is already closed." });
  });

  it("shows the server's own words for a refusal it has no sentence for, without the key", async () => {
    const { client } = answering({ data: null, error: { code: "22023", message: "taken_by_required: say who took the cash, or that it went to the safe." } });
    expect(await recordCashPickup({ shiftId: "s1", amountCents: 100, takenBy: null, toSafe: false, note: null }, client)).toMatchObject({
      refusal: "other",
      message: "Say who took the cash, or that it went to the safe.",
    });
  });

  it("calls a missing function 'not deployed' so the Drawer keeps its older path", async () => {
    const { client } = answering({ data: null, error: { code: "PGRST202", message: "not found" } });
    expect(await previewShiftClose("s1", client)).toMatchObject({ ok: false, kind: "not_deployed" });
  });

  it("calls a refusal by RLS/role 'forbidden'", async () => {
    const { client } = answering({ data: null, error: { code: "42501", message: "no" } });
    expect(await previewShiftClose("s1", client)).toMatchObject({ ok: false, kind: "forbidden" });
  });

  it("calls a malformed reply a failure", async () => {
    const { client } = answering({ data: { source: "server" }, error: null });
    expect(await previewShiftClose("s1", client)).toMatchObject({ ok: false, kind: "failed" });
  });

  it("reads a start, a join and a stale refusal, with the handover left in the drawer", async () => {
    const { client, calls } = answering({
      data: { state: "opened", shift: { id: "s2" }, handover: { previousShiftId: "s1", leftCents: 200000, staffName: "Ana", closedAt: "2026-10-24T06:48:00Z" } },
      error: null,
    });
    const result = await openShiftRpc(
      { tenantId: "t1", outletId: null, drawerId: "d1", openingFloatCents: 195000, openingDenominations: null, servicePeriodId: null, staffName: "Ben" },
      client,
    );
    expect(calls[0].args).toMatchObject({ p_opening_float_cents: 195000, p_drawer_id: "d1" });
    expect(result).toEqual({
      ok: true,
      data: { state: "opened", shiftId: "s2", handover: { previousShiftId: "s1", leftCents: 200000, staffName: "Ana", closedAt: "2026-10-24T06:48:00Z" } },
    });
  });

  it("records a pickup as one move + one remittance", async () => {
    const { client, calls } = answering({ data: { movementId: "m1", remittanceId: "r9" }, error: null });
    const result = await recordCashPickup({ shiftId: "s1", amountCents: 250000, takenBy: "u-maria", toSafe: false, note: null }, client);
    expect(calls[0]).toEqual({
      fn: "record_cash_pickup",
      args: { p_shift_id: "s1", p_amount_cents: 250000, p_taken_by: "u-maria", p_to_safe: false, p_note: null },
    });
    expect(result).toEqual({ ok: true, data: { movementId: "m1", remittanceId: "r9" } });
  });
});
