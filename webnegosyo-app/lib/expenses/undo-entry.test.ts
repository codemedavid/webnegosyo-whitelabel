import { buildUndoEntry, type UndoQueue } from "./undo-entry";

function queue(overrides: Partial<UndoQueue> = {}): UndoQueue {
  return {
    commit: jest.fn(async () => ({ sent: new Map([["r1", "srv-1"]]) })),
    undo: jest.fn(async () => ({ status: "undone" as const })),
    ...overrides,
  };
}

function build(q: UndoQueue, onSettled = jest.fn(), refresh = jest.fn(async () => {})) {
  const entry = buildUndoEntry({ id: "r1", message: "Saved · Gas ₱1,050", tenantId: "t1", actorName: "Ana", queue: q, refresh, onSettled });
  return { entry, onSettled, refresh };
}

describe("undo entry", () => {
  it("sends the entry, refreshes the lists when it landed, then tells the caller", async () => {
    const q = queue();
    const { entry, refresh, onSettled } = build(q);
    await entry.commit();
    expect(q.commit).toHaveBeenCalledWith("t1", "r1");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when the entry stayed on the phone, but still tells the caller", async () => {
    const q = queue({ commit: jest.fn(async () => ({ sent: new Map<string, string>() })) });
    const { entry, refresh, onSettled } = build(q);
    await entry.commit();
    expect(refresh).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("undoes as the person who saved it and refreshes", async () => {
    const q = queue();
    const { entry, refresh, onSettled } = build(q);
    await expect(entry.undo()).resolves.toEqual({ status: "undone" });
    expect(q.undo).toHaveBeenCalledWith({ tenantId: "t1", requestId: "r1", actorName: "Ana" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("passes a failed undo back without refreshing", async () => {
    const q = queue({ undo: jest.fn(async () => ({ status: "error" as const, message: "Nope" })) });
    const { entry, refresh, onSettled } = build(q);
    await expect(entry.undo()).resolves.toEqual({ status: "error", message: "Nope" });
    expect(refresh).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});

describe("undo entry offer", () => {
  it("carries a Repeat offer to the bar untouched, and none by default", () => {
    const offer = { label: "Repeat", message: "Saved · Rent ₱15,000 · Pay this every month?", href: "/(main)/expense-bills?new=1" };
    const base = { id: "r1", message: "Saved · Rent ₱15,000", tenantId: "t1", actorName: "Ana", queue: queue(), refresh: jest.fn(async () => {}) };
    expect(buildUndoEntry({ ...base, offer }).offer).toEqual(offer);
    expect(buildUndoEntry(base).offer).toBeNull();
  });
});
