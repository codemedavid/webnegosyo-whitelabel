/**
 * Cold-start session resolution: the difference between "you are signed out"
 * and "we could not reach the server".
 *
 * supabase-js reports a failed network read as `{ data: null, error }` rather
 * than throwing, so a phone that opened the app in a lift used to be treated
 * exactly like a deleted account and dropped on the login screen with its
 * perfectly good stored session. Only a genuine "no row" may sign anyone out.
 */
import {
  BOOTSTRAP_UNREACHABLE_MESSAGE,
  classifyLookup,
  isSignedOutOutcome,
  outcomeForThrown,
} from "./session-bootstrap";

describe("classifyLookup", () => {
  it("is a row when data is present", () => {
    expect(classifyLookup({ data: { id: "u1" }, error: null })).toEqual({
      kind: "row",
      row: { id: "u1" },
    });
  });

  it("is missing when PostgREST reports zero rows for .single()", () => {
    expect(
      classifyLookup({
        data: null,
        error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
      })
    ).toEqual({ kind: "missing" });
  });

  it("is missing when there is no data and no error", () => {
    expect(classifyLookup({ data: null, error: null })).toEqual({ kind: "missing" });
  });

  it("is unreachable for any other error, never a silent sign-out", () => {
    expect(
      classifyLookup({ data: null, error: { message: "TypeError: Network request failed" } })
    ).toEqual({ kind: "unreachable", message: BOOTSTRAP_UNREACHABLE_MESSAGE });
    expect(classifyLookup({ data: null, error: { code: "57014", message: "statement timeout" } })).toEqual({
      kind: "unreachable",
      message: BOOTSTRAP_UNREACHABLE_MESSAGE,
    });
  });
});

describe("outcomeForThrown", () => {
  it("treats a thrown read as unreachable", () => {
    expect(outcomeForThrown(new TypeError("Network request failed"))).toEqual({
      kind: "unreachable",
      message: BOOTSTRAP_UNREACHABLE_MESSAGE,
    });
  });
});

describe("isSignedOutOutcome", () => {
  it("only a missing row signs the account out", () => {
    expect(isSignedOutOutcome({ kind: "missing" })).toBe(true);
    expect(isSignedOutOutcome({ kind: "unreachable", message: "x" })).toBe(false);
    expect(isSignedOutOutcome({ kind: "row", row: {} })).toBe(false);
  });
});
