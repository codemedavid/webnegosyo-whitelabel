import {
  CASH_SETTINGS_COPY,
  DEFAULT_CASH_SETTINGS,
  VARIANCE_REASON_MAX_CENTS,
  fetchCashSettings,
  parseCashSettings,
  saveCashSettings,
  setBusinessDayCutoff,
  validateCashSettingsPatch,
  type CashDb,
} from "./settings";

interface Answer {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

/** supabase-js stand-in: records every builder call; awaiting takes the next scripted answer. */
function fakeDb(tableAnswers: Answer[] = [], rpcAnswers: Record<string, Answer> = {}) {
  const ops: [string, unknown[]][] = [];
  const rpcCalls: [string, Record<string, unknown> | undefined][] = [];
  const db: CashDb = {
    from(table: string) {
      ops.push(["from", [table]]);
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "eq", "is", "or", "order", "limit", "maybeSingle", "insert", "update"]) {
        builder[name] = (...args: unknown[]) => {
          ops.push([name, args]);
          return builder;
        };
      }
      builder.then = (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(tableAnswers.shift() ?? { data: null, error: null }).then(resolve, reject);
      return builder;
    },
    rpc(fn, args) {
      rpcCalls.push([fn, args]);
      return Promise.resolve(rpcAnswers[fn] ?? { data: null, error: null });
    },
  };
  return { db, ops, rpcCalls };
}

const ROW = {
  tenant_id: "t1",
  blind_close: true,
  require_denominations: true,
  variance_reason_from_cents: 5000,
  remittance_mode: "required",
  require_shift_to_sell: true,
  overdue_grace_minutes: 120,
  default_float_cents: 200000,
  updated_at: "2026-10-27T02:00:00.000Z",
  updated_by: "u1",
  updated_by_name: "Lorna Cruz",
};

describe("DEFAULT_CASH_SETTINGS", () => {
  it("are the contract's defaults, so a store with no row behaves as it did before", () => {
    expect(DEFAULT_CASH_SETTINGS).toEqual({
      blindClose: false,
      requireDenominations: false,
      varianceReasonFromCents: 2000,
      remittanceMode: "optional",
      requireShiftToSell: false,
      overdueGraceMinutes: 240,
      defaultFloatCents: null,
      updatedAt: null,
      updatedBy: null,
      updatedByName: null,
    });
    expect(Object.isFrozen(DEFAULT_CASH_SETTINGS)).toBe(true);
  });
});

describe("parseCashSettings", () => {
  it("reads a table row (snake_case)", () => {
    expect(parseCashSettings(ROW)).toEqual({
      blindClose: true,
      requireDenominations: true,
      varianceReasonFromCents: 5000,
      remittanceMode: "required",
      requireShiftToSell: true,
      overdueGraceMinutes: 120,
      defaultFloatCents: 200000,
      updatedAt: "2026-10-27T02:00:00.000Z",
      updatedBy: "u1",
      updatedByName: "Lorna Cruz",
    });
  });

  it("reads the RPC's camelCase answer the same way", () => {
    const camel = {
      blindClose: true,
      requireDenominations: false,
      varianceReasonFromCents: 0,
      remittanceMode: "off",
      requireShiftToSell: false,
      overdueGraceMinutes: 240,
      defaultFloatCents: null,
      updatedAt: null,
      updatedByName: null,
    };
    expect(parseCashSettings(camel)).toMatchObject({ blindClose: true, remittanceMode: "off", varianceReasonFromCents: 0 });
  });

  it("fills a missing field with its default instead of inventing a value", () => {
    expect(parseCashSettings({ blind_close: true })).toEqual({ ...DEFAULT_CASH_SETTINGS, blindClose: true });
  });

  it.each([
    ["an unknown remittance mode", { remittance_mode: "sometimes" }],
    ["a fractional threshold", { variance_reason_from_cents: 20.5 }],
    ["a negative threshold", { variance_reason_from_cents: -1 }],
    ["a text boolean", { blind_close: "yes" }],
    ["a negative float", { default_float_cents: -100 }],
  ])("refuses %s", (_label, raw) => {
    expect(() => parseCashSettings(raw)).toThrow(/cash rules/i);
  });

  it("refuses something that is not an object", () => {
    expect(() => parseCashSettings("nope")).toThrow();
    expect(() => parseCashSettings(null)).toThrow();
  });
});

describe("validateCashSettingsPatch", () => {
  it("keeps only the rule fields a person may change", () => {
    const verdict = validateCashSettingsPatch({ blindClose: true, varianceReasonFromCents: 3000 });
    expect(verdict).toEqual({ ok: true, value: { blindClose: true, varianceReasonFromCents: 3000 } });
  });

  it("refuses a threshold above the ceiling", () => {
    const verdict = validateCashSettingsPatch({ varianceReasonFromCents: VARIANCE_REASON_MAX_CENTS + 100 });
    expect(verdict.ok).toBe(false);
  });

  it("refuses an empty patch (nothing to save)", () => {
    expect(validateCashSettingsPatch({}).ok).toBe(false);
  });
});

describe("fetchCashSettings", () => {
  it("returns the defaults when the store has no row yet", async () => {
    const { db, ops } = fakeDb([{ data: null, error: null }]);
    await expect(fetchCashSettings(db, "t1")).resolves.toEqual(DEFAULT_CASH_SETTINGS);
    expect(ops).toContainEqual(["from", ["tenant_cash_settings"]]);
    expect(ops).toContainEqual(["eq", ["tenant_id", "t1"]]);
    expect(ops.some(([name]) => name === "maybeSingle")).toBe(true);
  });

  it("returns the stored rules", async () => {
    const { db } = fakeDb([{ data: ROW, error: null }]);
    await expect(fetchCashSettings(db, "t1")).resolves.toMatchObject({ blindClose: true, remittanceMode: "required" });
  });

  it("says plainly when the server has not been updated yet, never pretending the defaults are stored", async () => {
    const { db } = fakeDb([{ data: null, error: { code: "42P01", message: 'relation "tenant_cash_settings" does not exist' } }]);
    await expect(fetchCashSettings(db, "t1")).rejects.toThrow(CASH_SETTINGS_COPY.notReady);
  });

  it("surfaces any other failure", async () => {
    const { db } = fakeDb([{ data: null, error: { code: "500", message: "boom" } }]);
    await expect(fetchCashSettings(db, "t1")).rejects.toThrow(/boom/);
  });
});

describe("saveCashSettings", () => {
  it("sends only the changed rules, as column names, and returns what the server saved", async () => {
    const { db, rpcCalls } = fakeDb([], { save_cash_settings: { data: { ...ROW, blind_close: false }, error: null } });
    const saved = await saveCashSettings(db, "t1", { blindClose: false, requireShiftToSell: true });
    expect(rpcCalls).toEqual([
      ["save_cash_settings", { p_tenant: "t1", p_settings: { blind_close: false, require_shift_to_sell: true } }],
    ]);
    expect(saved.blindClose).toBe(false);
  });

  it("treats an empty answer as a refusal: RLS and definer checks refuse quietly", async () => {
    const { db } = fakeDb([], { save_cash_settings: { data: null, error: null } });
    await expect(saveCashSettings(db, "t1", { blindClose: true })).rejects.toThrow(CASH_SETTINGS_COPY.notSaved);
  });

  it("turns a permission refusal into words", async () => {
    const { db } = fakeDb([], { save_cash_settings: { data: null, error: { code: "42501", message: "denied" } } });
    await expect(saveCashSettings(db, "t1", { blindClose: true })).rejects.toThrow(CASH_SETTINGS_COPY.noAccess);
  });

  it("refuses a bad patch before reaching the server", async () => {
    const { db, rpcCalls } = fakeDb();
    await expect(saveCashSettings(db, "t1", { varianceReasonFromCents: -5 })).rejects.toThrow();
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("setBusinessDayCutoff", () => {
  it("returns the first business day the new cutoff applies to", async () => {
    const { db, rpcCalls } = fakeDb([], { set_business_day_cutoff: { data: "2026-10-28", error: null } });
    await expect(setBusinessDayCutoff(db, "t1", 240)).resolves.toBe("2026-10-28");
    expect(rpcCalls).toEqual([["set_business_day_cutoff", { p_tenant: "t1", p_cutoff_minutes: 240 }]]);
  });

  it.each([-15, 720, 250, 1.5])("refuses %p minutes before reaching the server", async (minutes) => {
    const { db, rpcCalls } = fakeDb();
    await expect(setBusinessDayCutoff(db, "t1", minutes)).rejects.toThrow();
    expect(rpcCalls).toHaveLength(0);
  });

  it("treats a missing date as a refusal", async () => {
    const { db } = fakeDb([], { set_business_day_cutoff: { data: null, error: null } });
    await expect(setBusinessDayCutoff(db, "t1", 240)).rejects.toThrow(CASH_SETTINGS_COPY.notSaved);
  });

  it("explains a permission refusal (owner or Settings only)", async () => {
    const { db } = fakeDb([], { set_business_day_cutoff: { data: null, error: { code: "42501", message: "no" } } });
    await expect(setBusinessDayCutoff(db, "t1", 240)).rejects.toThrow(CASH_SETTINGS_COPY.cutoffNoAccess);
  });
});
