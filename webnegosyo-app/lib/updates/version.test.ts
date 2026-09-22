import { compareVersions, isOlderThan, parseVersion } from "./version";

describe("parseVersion", () => {
  test("reads a three-part version into numbers", () => {
    expect(parseVersion("1.0.8")).toEqual([1, 0, 8]);
  });

  test("pads a short version so 1.2 and 1.2.0 are the same release", () => {
    expect(parseVersion("1.2")).toEqual([1, 2, 0]);
  });

  test("ignores a build suffix the stores append", () => {
    expect(parseVersion("1.0.8-beta.2")).toEqual([1, 0, 8]);
  });

  test("returns null for anything it cannot read", () => {
    expect(parseVersion("")).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
    expect(parseVersion("latest")).toBeNull();
  });
});

describe("compareVersions", () => {
  test("orders by number, not by text, so 1.0.10 is newer than 1.0.9", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.0.9", "1.0.10")).toBe(-1);
  });

  test("treats equal versions as equal across differing lengths", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  test("returns null when either side is unreadable", () => {
    expect(compareVersions("1.0.0", "nonsense")).toBeNull();
    expect(compareVersions(null, "1.0.0")).toBeNull();
  });
});

describe("isOlderThan", () => {
  test("is true only when the first version really is behind", () => {
    expect(isOlderThan("1.0.7", "1.0.8")).toBe(true);
    expect(isOlderThan("1.0.8", "1.0.8")).toBe(false);
    expect(isOlderThan("1.1.0", "1.0.8")).toBe(false);
  });

  // The gate locks merchants out of the register, so an unreadable version
  // must never be the reason it fires.
  test("is false when either version is unreadable", () => {
    expect(isOlderThan(null, "1.0.8")).toBe(false);
    expect(isOlderThan("1.0.8", "")).toBe(false);
  });
});
