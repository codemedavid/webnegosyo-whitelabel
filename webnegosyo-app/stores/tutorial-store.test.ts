/**
 * Tutorial progress store: per-account, device-local, survives restarts.
 * Pins that a finished chapter is written under the account's own key and
 * that a corrupt or missing record falls back to a fresh tour, never a crash.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTutorialStore, tutorialStorageKey } from "./tutorial-store";
import { EMPTY_PROGRESS } from "../lib/tutorial/progress";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe("useTutorialStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
    useTutorialStore.setState({ scope: null, progress: EMPTY_PROGRESS, isLoaded: false });
  });

  it("scopes storage per account, with a shared key for the demo", () => {
    expect(tutorialStorageKey("user-1")).toBe("tutorial_progress:user-1");
    expect(tutorialStorageKey("demo")).toBe("tutorial_progress:demo");
  });

  it("loads a fresh tour when nothing is saved", async () => {
    await useTutorialStore.getState().load("user-1");
    expect(useTutorialStore.getState()).toMatchObject({
      scope: "user-1",
      progress: EMPTY_PROGRESS,
      isLoaded: true,
    });
  });

  it("restores a saved record", async () => {
    storage.getItem.mockResolvedValueOnce(
      JSON.stringify({ completedChapterIds: ["orders"], lastChapterId: "orders", welcomeSeen: true }),
    );
    await useTutorialStore.getState().load("user-1");
    expect(useTutorialStore.getState().progress).toEqual({
      completedChapterIds: ["orders"],
      lastChapterId: "orders",
      welcomeSeen: true,
    });
  });

  it("treats a corrupt record as a fresh tour", async () => {
    storage.getItem.mockResolvedValueOnce("{not json");
    await useTutorialStore.getState().load("user-1");
    expect(useTutorialStore.getState().progress).toEqual(EMPTY_PROGRESS);
    expect(useTutorialStore.getState().isLoaded).toBe(true);
  });

  it("persists a completed chapter under the loaded account", async () => {
    await useTutorialStore.getState().load("user-1");
    await useTutorialStore.getState().completeChapter("orders");
    expect(useTutorialStore.getState().progress.completedChapterIds).toEqual(["orders"]);
    expect(storage.setItem).toHaveBeenCalledWith(
      "tutorial_progress:user-1",
      JSON.stringify({ completedChapterIds: ["orders"], lastChapterId: "orders", welcomeSeen: false }),
    );
  });

  it("keeps the in-memory state when the write fails", async () => {
    storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    await useTutorialStore.getState().load("user-1");
    await useTutorialStore.getState().dismissWelcome();
    expect(useTutorialStore.getState().progress.welcomeSeen).toBe(true);
  });

  it("resets chapters but not the greeter", async () => {
    await useTutorialStore.getState().load("user-1");
    await useTutorialStore.getState().dismissWelcome();
    await useTutorialStore.getState().completeChapter("orders");
    await useTutorialStore.getState().reset();
    expect(useTutorialStore.getState().progress).toEqual({ ...EMPTY_PROGRESS, welcomeSeen: true });
  });
});
