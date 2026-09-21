import { offlineBannerText } from "./banner-text";

describe("offlineBannerText", () => {
  it("says nothing while online with nothing queued — a working register looks unchanged", () => {
    expect(offlineBannerText("online", { pending: 0, stuck: 0 })).toBeNull();
    expect(offlineBannerText("unknown", { pending: 0, stuck: 0 })).toBeNull();
  });

  it("tells the cashier sales are kept on the device while offline", () => {
    expect(offlineBannerText("offline", { pending: 0, stuck: 0 })).toMatch(/^Offline — sales are saved on this device/);
    expect(offlineBannerText("offline", { pending: 1, stuck: 0 })).toBe("Offline — 1 sale saved on this device");
    expect(offlineBannerText("offline", { pending: 3, stuck: 0 })).toBe("Offline — 3 sales saved on this device");
  });

  it("shows the replay once the connection is back", () => {
    expect(offlineBannerText("online", { pending: 2, stuck: 0 })).toBe("Back online — syncing 2 sales…");
  });

  it("names a refused sale separately, so it is never mistaken for a slow one", () => {
    expect(offlineBannerText("online", { pending: 0, stuck: 1 })).toBe(
      "1 sale could not sync — check the order list"
    );
    expect(offlineBannerText("online", { pending: 1, stuck: 2 })).toBe(
      "Back online — syncing 1 sale… · 2 sales could not sync — check the order list"
    );
  });
});
