import { DEFAULT_ACTIVITY_FILTERS } from "./filters";
import { activityHref, filtersFromParams, paramsKey } from "./activity-links";

describe("activityHref", () => {
  it("opens the feed on one person", () => {
    expect(activityHref({ actor: { id: "u1", name: "Ana Reyes" } })).toBe(
      "/(main)/activity?actor=u1&actorName=Ana%20Reyes",
    );
  });

  it("opens the feed on one subject", () => {
    expect(activityHref({ subject: { type: "ingredient", ref: "ing 1", label: "Rice & Co" } })).toBe(
      "/(main)/activity?subjectType=ingredient&subjectRef=ing%201&subjectLabel=Rice%20%26%20Co",
    );
  });

  it("opens the plain feed with nothing", () => {
    expect(activityHref({})).toBe("/(main)/activity");
  });
});

describe("filtersFromParams", () => {
  it("turns a person link back into a filter", () => {
    expect(filtersFromParams({ actor: "u1", actorName: "Ana Reyes" })).toEqual({
      ...DEFAULT_ACTIVITY_FILTERS,
      actor: { id: "u1", name: "Ana Reyes" },
    });
  });

  it("looks a whole month back for one subject's story", () => {
    expect(filtersFromParams({ subjectType: "ingredient", subjectRef: "ing-1", subjectLabel: "Rice" })).toEqual({
      ...DEFAULT_ACTIVITY_FILTERS,
      period: "month",
      subject: { type: "ingredient", ref: "ing-1", label: "Rice" },
    });
  });

  it("ignores a subject type this build does not know, and arrays from repeated params", () => {
    expect(filtersFromParams({ subjectType: "spaceship", subjectRef: "x" })).toBeNull();
    expect(filtersFromParams({ actor: ["u1", "u2"] })).toEqual({
      ...DEFAULT_ACTIVITY_FILTERS,
      actor: { id: "u1", name: "Staff" },
    });
  });

  it("returns null when the link carries no filter, so the screen keeps what it had", () => {
    expect(filtersFromParams({})).toBeNull();
  });
});

describe("paramsKey", () => {
  it("is stable for the same link and changes for another", () => {
    expect(paramsKey({ actor: "u1" })).toBe(paramsKey({ actor: "u1" }));
    expect(paramsKey({ actor: "u1" })).not.toBe(paramsKey({ actor: "u2" }));
    expect(paramsKey({})).toBe("");
  });
});
