/**
 * Row-level security refuses an UPDATE or DELETE silently: no error, zero
 * rows. A writer that checks only `error` reports "saved" for a write the
 * database turned away. These two checks are the app's copy of the web's
 * `src/platform/db/assert-rows-changed.ts` and `assert-rows-changed-or-gone.ts`
 * (the app cannot import from `src/`).
 */
import {
  NOTHING_CHANGED_MESSAGE,
  assertRowsChanged,
  assertRowsChangedOrGone,
  writeFailure,
} from "./assert-rows-changed";

const nothingLeft = () => Promise.resolve({ data: [], error: null });
const stillThere = () => Promise.resolve({ data: [{ id: "a" }], error: null });

describe("assertRowsChanged", () => {
  it("passes when rows came back from .select()", () => {
    expect(assertRowsChanged({ data: [{ id: "a" }, { id: "b" }], error: null })).toEqual({ ok: true, count: 2 });
  });

  it("fails on zero rows with no error: the shape of an RLS refusal", () => {
    expect(assertRowsChanged({ data: [], error: null })).toEqual({ ok: false, reason: "no-rows-changed" });
  });

  it("reads .single() / .maybeSingle() as one row or none", () => {
    expect(assertRowsChanged({ data: { id: "a" }, error: null })).toEqual({ ok: true, count: 1 });
    expect(assertRowsChanged({ data: null, error: null, status: 200 })).toEqual({ ok: false, reason: "no-rows-changed" });
  });

  it("reads a { count: 'exact' } write by its count", () => {
    expect(assertRowsChanged({ data: null, error: null, count: 3, status: 204 })).toEqual({ ok: true, count: 3 });
    expect(assertRowsChanged({ data: null, error: null, count: 0, status: 204 })).toEqual({ ok: false, reason: "no-rows-changed" });
  });

  it("fails a write that asked for neither rows nor a count, instead of trusting 'no error'", () => {
    expect(assertRowsChanged({ data: null, error: null, status: 204 })).toEqual({ ok: false, reason: "not-counted" });
    expect(assertRowsChanged({ error: null })).toEqual({ ok: false, reason: "not-counted" });
  });

  it("returns the database error as it is, even when rows are present", () => {
    const error = { message: "new row violates row-level security policy", code: "42501" };

    expect(assertRowsChanged({ data: [{ id: "a" }], error })).toEqual({ ok: false, reason: "error", error });
  });
});

describe("assertRowsChangedOrGone", () => {
  it("passes when the write changed rows, without looking for what is left", async () => {
    const remaining = jest.fn(stillThere);

    expect(await assertRowsChangedOrGone({ data: [{ id: "a" }], error: null }, remaining)).toEqual({ ok: true, count: 1 });
    expect(remaining).not.toHaveBeenCalled();
  });

  it("passes with a count of zero when the row is already gone: the second tap of a double tap", async () => {
    expect(await assertRowsChangedOrGone({ data: [], error: null }, nothingLeft)).toEqual({ ok: true, count: 0 });
  });

  it("fails as refused when zero rows changed and the row is still there", async () => {
    expect(await assertRowsChangedOrGone({ data: [], error: null }, stillThere)).toEqual({ ok: false, reason: "refused" });
  });

  it("returns the write's error, and the error of the look for what is left", async () => {
    const error = { message: "timeout" };

    expect(await assertRowsChangedOrGone({ data: null, error }, nothingLeft)).toEqual({ ok: false, reason: "error", error });
    expect(
      await assertRowsChangedOrGone({ data: [], error: null }, () => Promise.resolve({ data: null, error })),
    ).toEqual({ ok: false, reason: "error", error });
  });

  it("fails a write that asked for neither rows nor a count", async () => {
    expect(await assertRowsChangedOrGone({ error: null, status: 204 }, nothingLeft)).toEqual({ ok: false, reason: "not-counted" });
  });
});

describe("writeFailure: what a throwing writer throws", () => {
  it("is the database error itself, so handling of its code keeps working", () => {
    const error = { message: "duplicate key", code: "23505" };

    expect(writeFailure({ ok: false, reason: "error", error })).toBe(error);
  });

  it("is an Error the person can read when the database changed nothing", () => {
    const failure = writeFailure({ ok: false, reason: "refused" });

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe(NOTHING_CHANGED_MESSAGE);
    expect(NOTHING_CHANGED_MESSAGE).toBe("Nothing was changed. You may not have access to do this.");
  });
});
