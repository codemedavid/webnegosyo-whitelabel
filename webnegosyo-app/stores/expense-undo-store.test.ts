import { SETTLED_MEMORY, UNDO_WINDOW_MS, createExpenseUndoStore, type UndoEntry, type UndoResult } from "./expense-undo-store";

function entry(id: string, undoResult: UndoResult = { status: "undone" }) {
  const commit = jest.fn(async () => {});
  const undo = jest.fn(async () => undoResult);
  const value: UndoEntry = { id, message: `Saved · ${id}`, commit, undo };
  return { value, commit, undo };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("expense undo store", () => {
  it("shows a saved entry and sends it once its window closes", () => {
    const store = createExpenseUndoStore();
    const lpg = entry("lpg");

    store.getState().show(lpg.value);
    expect(store.getState().current?.id).toBe("lpg");
    jest.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(lpg.commit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(lpg.commit).toHaveBeenCalledTimes(1);
    expect(store.getState().current).toBeNull();
  });

  it("shows the newest of several saves and still sends each exactly once", () => {
    const store = createExpenseUndoStore();
    const first = entry("first");
    const second = entry("second");

    store.getState().show(first.value);
    store.getState().show(second.value);
    // A second save inside the window sends the first one now.
    expect(first.commit).toHaveBeenCalledTimes(1);
    expect(store.getState().current?.id).toBe("second");

    jest.advanceTimersByTime(UNDO_WINDOW_MS);
    store.getState().commit("first");
    store.getState().commit("second");
    expect(first.commit).toHaveBeenCalledTimes(1);
    expect(second.commit).toHaveBeenCalledTimes(1);
  });

  it("Undo takes the entry back and it is never sent afterwards", async () => {
    const store = createExpenseUndoStore();
    const ice = entry("ice");
    store.getState().show(ice.value);

    await expect(store.getState().undo("ice")).resolves.toEqual({ status: "undone" });
    expect(store.getState().current).toBeNull();
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
    store.getState().commit("ice");
    expect(ice.commit).not.toHaveBeenCalled();
    // A second tap (two bars on screen) does nothing.
    await expect(store.getState().undo("ice")).resolves.toBeNull();
    expect(ice.undo).toHaveBeenCalledTimes(1);
  });

  it("cannot undo an entry already sent", async () => {
    const store = createExpenseUndoStore();
    const ice = entry("ice");
    store.getState().show(ice.value);
    store.getState().commit("ice");

    await expect(store.getState().undo("ice")).resolves.toBeNull();
    expect(ice.undo).not.toHaveBeenCalled();
  });

  it("hands back the reason an undo failed, and a throwing undo as a failure", async () => {
    const store = createExpenseUndoStore();
    const refused = entry("a", { status: "error", message: "It is still being saved." });
    store.getState().show(refused.value);
    await expect(store.getState().undo("a")).resolves.toEqual({ status: "error", message: "It is still being saved." });

    const broken: UndoEntry = { id: "b", message: "Saved · b", commit: jest.fn(async () => {}), undo: jest.fn(async () => Promise.reject(new Error("boom"))) };
    store.getState().show(broken);
    await expect(store.getState().undo("b")).resolves.toEqual({ status: "error", message: "Could not undo it. Try again." });
  });

  it("ignores the same entry shown twice", () => {
    const store = createExpenseUndoStore();
    const lpg = entry("lpg");
    store.getState().show(lpg.value);
    store.getState().show(lpg.value);
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(lpg.commit).toHaveBeenCalledTimes(1);
  });

  it("keeps sending when a commit fails", async () => {
    const store = createExpenseUndoStore();
    const failing: UndoEntry = { id: "x", message: "Saved · x", commit: jest.fn(async () => Promise.reject(new Error("offline"))), undo: jest.fn() };
    store.getState().show(failing);
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
    await Promise.resolve();
    expect(failing.commit).toHaveBeenCalledTimes(1);
    expect(store.getState().current).toBeNull();
  });

  it("remembers only the last settled ids, so a long day does not grow the set forever", () => {
    // Arrange: one more entry than the store remembers, each sent in turn.
    const store = createExpenseUndoStore();
    const ids = Array.from({ length: SETTLED_MEMORY + 1 }, (_, index) => `e${index}`);
    for (const id of ids) {
      store.getState().show(entry(id).value);
      store.getState().commit(id);
    }

    // Act: the oldest id has been forgotten; the newest is still remembered.
    const oldest = entry("e0");
    store.getState().show(oldest.value);
    const shownOldest = store.getState().current?.id;
    store.getState().commit("e0");
    const newest = entry(ids[ids.length - 1]);
    store.getState().show(newest.value);

    // Assert
    expect(SETTLED_MEMORY).toBe(50);
    expect(shownOldest).toBe("e0");
    expect(store.getState().current).toBeNull();
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(newest.commit).not.toHaveBeenCalled();
  });
});
