// Which "What's New" post, if any, greets a merchant when the app opens —
// and whether this session should be greeted at all. Pure rules so the popup
// host can stay a thin shell around them.

import {
  announcementRouteFromPushData,
  pickPopupAnnouncement,
  shouldShowWhatsNew,
  type PopupCandidate,
} from "./popup";

const published = (
  id: string,
  publishedAt: string,
  overrides: Partial<PopupCandidate> = {}
): PopupCandidate => ({
  id,
  kind: "post",
  showPopup: true,
  publishedAt,
  ...overrides,
});

describe("pickPopupAnnouncement", () => {
  it("picks the newest unread post that wants a popup", () => {
    const candidates = [
      published("old", "2026-08-01T00:00:00Z"),
      published("new", "2026-09-01T00:00:00Z"),
      published("newest-but-read", "2026-09-02T00:00:00Z"),
    ];
    const pick = pickPopupAnnouncement(candidates, new Set(["newest-but-read"]));
    expect(pick?.id).toBe("new");
  });

  it("skips posts that opted out of the popup and notices", () => {
    const candidates = [
      published("quiet", "2026-09-03T00:00:00Z", { showPopup: false }),
      published("notice", "2026-09-02T00:00:00Z", { kind: "notice" }),
      published("loud", "2026-09-01T00:00:00Z"),
    ];
    expect(pickPopupAnnouncement(candidates, new Set())?.id).toBe("loud");
  });

  it("returns null when everything is read", () => {
    const candidates = [published("a", "2026-09-01T00:00:00Z")];
    expect(pickPopupAnnouncement(candidates, new Set(["a"]))).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pickPopupAnnouncement([], new Set())).toBeNull();
  });
});

describe("shouldShowWhatsNew", () => {
  const live = {
    isAuthenticated: true,
    userId: "u1",
    isDemo: false,
    isSuperadmin: false,
    impersonatedTenantId: null,
  };

  it("greets a signed-in merchant", () => {
    expect(shouldShowWhatsNew(live)).toBe(true);
  });

  it("never greets the demo, a signed-out shell, or a superadmin borrowing a store", () => {
    expect(shouldShowWhatsNew({ ...live, isDemo: true })).toBe(false);
    expect(shouldShowWhatsNew({ ...live, isAuthenticated: false })).toBe(false);
    expect(shouldShowWhatsNew({ ...live, userId: null })).toBe(false);
    expect(
      shouldShowWhatsNew({ ...live, isSuperadmin: true, impersonatedTenantId: "t1" })
    ).toBe(false);
  });
});

describe("announcementRouteFromPushData", () => {
  it("routes a tapped announcement push to its detail screen", () => {
    expect(announcementRouteFromPushData({ announcementId: "ann-1", kind: "post" })).toBe(
      "/(main)/whats-new/ann-1"
    );
  });

  it("routes a notice to the inbox list", () => {
    expect(announcementRouteFromPushData({ announcementId: "ann-2", kind: "notice" })).toBe(
      "/(main)/whats-new"
    );
  });

  it("ignores order pushes and junk", () => {
    expect(announcementRouteFromPushData({ orderId: "o1" })).toBeNull();
    expect(announcementRouteFromPushData(null)).toBeNull();
    expect(announcementRouteFromPushData({ announcementId: 42 })).toBeNull();
  });
});
