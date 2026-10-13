import { canOpenMyActivity, MY_ACTIVITY_HREF, myActivityFilters } from "./my-activity";
import { DEFAULT_ACTIVITY_FILTERS } from "./filters";

describe("canOpenMyActivity", () => {
  it("is open to anyone signed in to a store, whatever their grants", () => {
    expect(canOpenMyActivity({ userId: "u1", tenantId: "t1", isDemo: false })).toBe(true);
  });

  it("needs a person and a store, and is closed in demo mode (no real account)", () => {
    expect(canOpenMyActivity({ userId: null, tenantId: "t1", isDemo: false })).toBe(false);
    expect(canOpenMyActivity({ userId: "u1", tenantId: null, isDemo: false })).toBe(false);
    expect(canOpenMyActivity({ userId: "u1", tenantId: "t1", isDemo: true })).toBe(false);
  });
});

describe("myActivityFilters", () => {
  it("is today's activity by this person only", () => {
    expect(myActivityFilters("u1", "today")).toEqual({
      ...DEFAULT_ACTIVITY_FILTERS,
      period: "today",
      actor: { id: "u1", name: "You" },
    });
    expect(myActivityFilters("u1", "last7").period).toBe("last7");
  });
});

describe("MY_ACTIVITY_HREF", () => {
  it("is the utility route", () => {
    expect(MY_ACTIVITY_HREF).toBe("/(main)/my-activity");
  });
});
