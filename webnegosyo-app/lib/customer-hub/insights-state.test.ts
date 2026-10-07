import { resolveInsightsState, type InsightsStateInput } from "./insights-state";

const ready: InsightsStateInput = {
  canSeeCustomers: true,
  isHubOnLocally: true,
  isLoading: false,
  hasError: false,
  result: { ok: true, hasDashboard: true },
};

describe("resolveInsightsState", () => {
  it("shows the dashboard when the platform sent one", () => {
    expect(resolveInsightsState(ready)).toBe("ready");
  });

  it("shows nothing customer-shaped to an account that may not see customers", () => {
    expect(resolveInsightsState({ ...ready, canSeeCustomers: false })).toBe("hidden");
  });

  it("says the store is not switched on when the store itself is off", () => {
    expect(resolveInsightsState({ ...ready, isHubOnLocally: false })).toBe("off");
  });

  it("calls it a pending update when the app says on but the platform still refuses", () => {
    // The app ships ahead of the web deploy: a platform store is on here, and
    // the old route still answers "not enabled". That is not the store's state.
    expect(resolveInsightsState({ ...ready, result: { ok: false, reason: "disabled" } })).toBe("pending_update");
    expect(resolveInsightsState({ ...ready, result: { ok: true, hasDashboard: false } })).toBe("pending_update");
  });

  it("waits while loading, and reports a failed read as an error", () => {
    expect(resolveInsightsState({ ...ready, isLoading: true, result: undefined })).toBe("loading");
    expect(resolveInsightsState({ ...ready, result: { ok: false, reason: "unavailable" } })).toBe("error");
    expect(resolveInsightsState({ ...ready, hasError: true })).toBe("error");
  });

  it("hides the section when the platform says this account may not see customers", () => {
    expect(resolveInsightsState({ ...ready, result: { ok: false, reason: "forbidden" } })).toBe("hidden");
  });
});
