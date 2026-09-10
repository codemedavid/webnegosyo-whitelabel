/**
 * The guard that stands between a screen's id and a Postgres `uuid` column.
 *
 * Ids reach this app from three places and only one of them is a uuid: platform
 * rows are uuids, Convex documents are opaque strings like
 * `js71q9w4ja9g3ryvap69b9xxms8e3fzs`, and a screen that lost its argument sends
 * `undefined`. supabase-js serialises all three into the query string verbatim,
 * so `id=eq.undefined` reaches Postgres and comes back as `invalid input syntax
 * for type uuid` (22P02) — a raw database error on a cashier's screen, or, on a
 * write, a refusal in the middle of a multi-step edit.
 */

import { isUuid, toUuidOrNull } from "./uuid";

const PLATFORM_ID = "1f2e3d4c-5b6a-4798-8a0b-1c2d3e4f5061";
const CONVEX_ID = "js71q9w4ja9g3ryvap69b9xxms8e3fzs";

describe("isUuid", () => {
  it("accepts a canonical uuid in either case", () => {
    expect(isUuid(PLATFORM_ID)).toBe(true);
    expect(isUuid(PLATFORM_ID.toUpperCase())).toBe(true);
  });

  it("rejects a Convex document id", () => {
    // The merchant app serves three backends from one set of screens, so a
    // Convex id genuinely arrives here — it must be skipped, not attempted.
    expect(isUuid(CONVEX_ID)).toBe(false);
  });

  it("rejects the values a lost argument turns into", () => {
    // `String(undefined)` is the literal "undefined", which is exactly how the
    // ledger reads used to reach a uuid column.
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid("undefined")).toBe(false);
    expect(isUuid("null")).toBe(false);
    expect(isUuid("")).toBe(false);
  });

  it("rejects anything that is not a string", () => {
    expect(isUuid(42)).toBe(false);
    expect(isUuid({ id: PLATFORM_ID })).toBe(false);
  });

  it("rejects a uuid-shaped string with the wrong number of digits", () => {
    expect(isUuid("1f2e3d4c-5b6a-4798-8a0b-1c2d3e4f506")).toBe(false);
    expect(isUuid(`${PLATFORM_ID}0`)).toBe(false);
  });
});

describe("toUuidOrNull", () => {
  it("hands back a real uuid unchanged", () => {
    expect(toUuidOrNull(PLATFORM_ID)).toBe(PLATFORM_ID);
  });

  it("turns everything else into NULL rather than refusing", () => {
    // For a NULLABLE uuid column this is the honest write: `menu_item_id` is
    // already set to null by the database when a menu item is deleted, so a
    // line that can no longer name its product stores the same thing.
    expect(toUuidOrNull("")).toBeNull();
    expect(toUuidOrNull(CONVEX_ID)).toBeNull();
    expect(toUuidOrNull(undefined)).toBeNull();
    expect(toUuidOrNull(null)).toBeNull();
  });
});
