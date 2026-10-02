import { formatSavedAge, offlineReadyStatus } from "./offline-ready-text";

const MINUTE = 60_000;
const NOW = 1_000 * 24 * 60 * MINUTE;
const MANIFEST = {
  savedAt: NOW - 5 * MINUTE,
  summary: { items: 42, orderTypes: 2, paymentMethods: 3 },
  missing: [],
};
const BASE = {
  isLoaded: true,
  isDownloading: false,
  isOffline: false,
  lastFailed: [] as string[],
  manifest: null,
  now: NOW,
};

describe("formatSavedAge", () => {
  it("reads like a person would say it", () => {
    expect(formatSavedAge(NOW - 20_000, NOW)).toBe("just now");
    expect(formatSavedAge(NOW - 5 * MINUTE, NOW)).toBe("5 min ago");
    expect(formatSavedAge(NOW - 3 * 60 * MINUTE, NOW)).toBe("3 h ago");
    expect(formatSavedAge(NOW - 24 * 60 * MINUTE, NOW)).toBe("1 day ago");
    expect(formatSavedAge(NOW - 3 * 24 * 60 * MINUTE, NOW)).toBe("3 days ago");
  });

  it("never claims the future", () => {
    expect(formatSavedAge(NOW + MINUTE, NOW)).toBe("just now");
  });
});

describe("offlineReadyStatus", () => {
  it("says nothing until the saved record has been read", () => {
    expect(offlineReadyStatus({ ...BASE, isLoaded: false })).toBeNull();
  });

  it("offers to save when this device has never saved the register", () => {
    expect(offlineReadyStatus(BASE)).toEqual({
      tone: "warning",
      text: "Not saved for offline use yet",
      actionLabel: "Save now",
    });
  });

  it("shows progress on the first save", () => {
    expect(offlineReadyStatus({ ...BASE, isDownloading: true })).toEqual({
      tone: "neutral",
      text: "Saving the menu and payment methods for offline use…",
      actionLabel: null,
    });
  });

  it("names what could not be saved, and offers to try again", () => {
    expect(offlineReadyStatus({ ...BASE, lastFailed: ["menu", "payment methods"] })).toEqual({
      tone: "warning",
      text: "Not saved for offline use — could not download the menu and payment methods",
      actionLabel: "Try again",
    });
  });

  it("confirms what is ready and how old it is", () => {
    expect(offlineReadyStatus({ ...BASE, manifest: MANIFEST })).toEqual({
      tone: "ok",
      text: "Ready offline · 42 items · 3 payment methods · saved 5 min ago",
      actionLabel: "Update",
    });
  });

  it("uses singulars for one", () => {
    const one = { ...MANIFEST, summary: { items: 1, orderTypes: 1, paymentMethods: 1 } };
    expect(offlineReadyStatus({ ...BASE, manifest: one })?.text).toBe(
      "Ready offline · 1 item · 1 payment method · saved 5 min ago",
    );
  });

  it("says the register is selling from the saved copy while offline, with no action", () => {
    expect(offlineReadyStatus({ ...BASE, manifest: MANIFEST, isOffline: true })).toEqual({
      tone: "ok",
      text: "Using the menu saved 5 min ago · 42 items · 3 payment methods",
      actionLabel: null,
    });
  });

  it("does not offer to save while offline — it cannot work", () => {
    expect(offlineReadyStatus({ ...BASE, isOffline: true })).toEqual({
      tone: "warning",
      text: "Not saved for offline use yet — connect to the internet once to save the menu",
      actionLabel: null,
    });
  });

  it("keeps the ready line while an update runs", () => {
    expect(offlineReadyStatus({ ...BASE, manifest: MANIFEST, isDownloading: true })).toEqual({
      tone: "ok",
      text: "Updating the offline copy…",
      actionLabel: null,
    });
  });
});
