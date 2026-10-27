/**
 * The slip's reads are pinned to the migration that creates the tables
 * (20261027160000_cash_remittances.sql): a column the database does not have
 * fails EVERY read (`resolution_note` once did), and an unnamed embed turns
 * ambiguous the day a second link to staff_shifts appears.
 */

jest.mock("../supabase", () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock("./use-cash-rules", () => ({ liveCashDb: {} }));

import { readFileSync } from "fs";
import { join } from "path";

import { fetchRemittance, fetchSlipCounts, fetchSlipMoves, REMITTANCE_COLUMNS, SLIP_COUNT_COLUMNS, SLIP_MOVE_COLUMNS } from "./shift-remit-read";
import type { CashDb } from "./settings";

const MIGRATIONS = join(__dirname, "..", "..", "..", "supabase", "migrations");
const migration = (name: string) => readFileSync(join(MIGRATIONS, name), "utf8");

function tableColumns(sql: string, table: string): Set<string> {
  const block = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
  return new Set(
    block
      .split("\n")
      .map((line) => line.trim().match(/^([a-z_]+)\s+(uuid|text|bigint|boolean|date|timestamptz|smallint|integer|jsonb|numeric)/)?.[1])
      .filter((name): name is string => Boolean(name)),
  );
}

describe("remittance slip reads match the migration", () => {
  const sql = migration("20261027160000_cash_remittances.sql");

  it("selects only cash_remittances columns that exist", () => {
    const columns = tableColumns(sql, "cash_remittances");
    expect(columns.size).toBeGreaterThan(20);
    const own = REMITTANCE_COLUMNS.replace(/,?\s*shift:[^)]*\)/, "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    for (const column of own) expect(columns).toContain(column);
    expect(REMITTANCE_COLUMNS).not.toContain("resolution_note");
  });

  it("embeds the shift through its named foreign key", () => {
    expect(sql).toContain("constraint cash_remittances_shift_id_fkey foreign key (shift_id) references public.staff_shifts(id)");
    expect(REMITTANCE_COLUMNS).toContain("shift:staff_shifts!cash_remittances_shift_id_fkey(");
  });

  it("reads only shift_counts columns that exist", () => {
    const counts = tableColumns(migration("20261027150000_cash_activity_and_close.sql"), "shift_counts");
    for (const column of SLIP_COUNT_COLUMNS.split(",").map((c) => c.trim())) expect(counts).toContain(column);
  });

  it("reads taken_by_name, which the pickups migration adds to shift_cash_movements", () => {
    expect(sql).toMatch(/add column if not exists taken_by_name text/);
    expect(SLIP_MOVE_COLUMNS).toContain("taken_by_name");
  });
});

/** A chainable stub answering one table read. */
function db(answers: { data: unknown; error: { code?: string; message?: string } | null }[]) {
  const selects: string[] = [];
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.select = (columns: string) => {
      selects.push(columns);
      return c;
    };
    c.eq = () => c;
    c.order = () => c;
    const settle = () => Promise.resolve(answers.shift() ?? { data: null, error: null });
    c.maybeSingle = settle;
    c.then = (resolve: (v: unknown) => unknown) => settle().then(resolve);
    return c;
  };
  return { db: { from: () => chain(), rpc: jest.fn() } as unknown as CashDb, selects };
}

describe("fetchRemittance / fetchSlipMoves", () => {
  it("parses a snake_case row and answers null for one it cannot see", async () => {
    const row = {
      id: "r1", tenant_id: "t1", outlet_id: null, kind: "shift", shift_id: "s1", movement_id: null, business_day: "2026-10-24",
      cashier_user_id: "u", cashier_name: "Ana", handed_over_cents: 634500, remitted_to: null, remitted_to_name: "Maria", to_safe: false,
      status: "pending", received_cents: null, received_by_name: null, received_at: null, accept_method: null, is_self_received: false,
      receiver_note: null, dispute_reason: null, resolved_by_name: null, resolved_at: null, resolved_note: null, created_at: "2026-10-24T18:48:00Z",
      shift: { drawer_name: "Cashier 1", opened_at: "x", closed_at: "y", closing_count: "8345.00", expected_cash: "8465.00", variance_reason: "wrong_change" },
    };
    const { db: found } = db([{ data: row, error: null }]);
    expect(await fetchRemittance(found, "t1", "r1")).toMatchObject({ id: "r1", handedOverCents: 634500, shift: { countedCents: 834500, expectedCents: 846500 } });
    const { db: hidden } = db([{ data: null, error: null }]);
    expect(await fetchRemittance(hidden, "t1", "r1")).toBeNull();
  });

  it("reads pickups in centavos and falls back when taken_by_name is not there yet", async () => {
    const { db: old, selects } = db([
      { data: null, error: { code: "42703", message: "column does not exist" } },
      { data: [{ kind: "collect", amount: "2500.00", created_at: "t" }, { kind: "sale", amount: 1 }], error: null },
    ]);
    expect(await fetchSlipMoves(old, "t1", "s1")).toEqual([{ kind: "collect", cents: 250000, at: "t", takenByName: null }]);
    expect(selects).toEqual([SLIP_MOVE_COLUMNS, "kind, amount, created_at"]);
  });

  it("reads the shift's counts for the recount flag", async () => {
    const { db: counts } = db([{ data: [{ attempt: 1, counted_cents: 0 }, { attempt: 2, counted_cents: "834500" }], error: null }]);
    expect(await fetchSlipCounts(counts, "t1", "s1")).toEqual([
      { attempt: 1, countedCents: 0, expectedSource: null },
      { attempt: 2, countedCents: 834500, expectedSource: null },
    ]);
  });

  it("throws on a failed read rather than drawing an empty slip", async () => {
    const { db: broken } = db([{ data: null, error: { code: "XX000", message: "boom" } }]);
    await expect(fetchRemittance(broken, "t1", "r1")).rejects.toThrow();
  });
});
