import { offlineOrdersNotice } from "./offline-orders-notice";

const MINUTE = 60_000;

describe("offlineOrdersNotice", () => {
  it("is silent when online with nothing waiting", () => {
    expect(offlineOrdersNotice({ isOffline: false, savedAt: null, now: 0, waiting: 0, stuck: 0 })).toBeNull();
  });

  it("says the list comes from this device while offline", () => {
    expect(
      offlineOrdersNotice({ isOffline: true, savedAt: 0, now: 5 * MINUTE, waiting: 2, stuck: 0 })
    ).toEqual({
      tone: "offline",
      text: "Offline · orders as of 5 min ago, plus 2 not yet synced. Keep working — changes sync when you're back online.",
    });
  });

  it("does not claim a saved time for a list that is still live in memory", () => {
    expect(offlineOrdersNotice({ isOffline: true, savedAt: null, now: 0, waiting: 0, stuck: 0 })?.text).toBe(
      "Offline · showing orders on this device. Keep working — changes sync when you're back online."
    );
  });

  it("reports work still syncing once back online", () => {
    expect(offlineOrdersNotice({ isOffline: false, savedAt: null, now: 0, waiting: 1, stuck: 0 })).toEqual({
      tone: "syncing",
      text: "Syncing 1 order update…",
    });
  });

  it("asks for a person when the server keeps refusing", () => {
    expect(offlineOrdersNotice({ isOffline: false, savedAt: null, now: 0, waiting: 0, stuck: 3 })).toEqual({
      tone: "attention",
      text: "3 order updates could not sync. Open the orders marked “Could not sync”.",
    });
  });
});
