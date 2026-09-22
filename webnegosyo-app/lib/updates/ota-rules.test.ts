import { otaStatusFromCheck, shouldCheckOta, shouldReloadAfterFetch } from "./ota-rules";

describe("shouldCheckOta", () => {
  test("checks in a real build", () => {
    expect(shouldCheckOta({ isEnabled: true, isDev: false })).toBe(true);
  });

  // Metro owns the bundle in development; checking would either throw or
  // offer to replace the code the developer is editing.
  test("never checks in development or when updates are switched off", () => {
    expect(shouldCheckOta({ isEnabled: true, isDev: true })).toBe(false);
    expect(shouldCheckOta({ isEnabled: false, isDev: false })).toBe(false);
  });
});

describe("otaStatusFromCheck", () => {
  test("reports an available update with its id", () => {
    expect(otaStatusFromCheck({ isAvailable: true, manifest: { id: "abc" } })).toEqual({
      isAvailable: true,
      updateId: "abc",
    });
  });

  test("reports nothing available", () => {
    expect(otaStatusFromCheck({ isAvailable: false })).toEqual({ isAvailable: false, updateId: null });
  });

  // A rollback is expo-updates telling the app to go back to the embedded
  // bundle. It is not a new version to offer anyone.
  test("treats a rollback directive as nothing to offer", () => {
    expect(otaStatusFromCheck({ isAvailable: false, isRollBackToEmbedded: true })).toEqual({
      isAvailable: false,
      updateId: null,
    });
  });

  test("survives an update whose manifest carries no id", () => {
    expect(otaStatusFromCheck({ isAvailable: true })).toEqual({ isAvailable: true, updateId: null });
  });
});

describe("shouldReloadAfterFetch", () => {
  test("reloads only once something new actually landed", () => {
    expect(shouldReloadAfterFetch({ isNew: true })).toBe(true);
    expect(shouldReloadAfterFetch({ isNew: false })).toBe(false);
  });

  // Restarting into the same bundle looks to the merchant like the update
  // failed silently.
  test("does not reload for a rollback to the embedded bundle", () => {
    expect(shouldReloadAfterFetch({ isNew: false, isRollBackToEmbedded: true })).toBe(false);
  });
});
