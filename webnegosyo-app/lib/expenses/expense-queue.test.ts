import {
  EXPENSE_QUEUE_STORAGE_KEY,
  createExpenseQueue,
  nextExpenseRetryAt,
  parseExpenseQueue,
  createSingleFlight,
  pendingDrawerCents,
  refusedDrawerPayouts,
  type KeyValueStorage,
  type NewQueuedExpense,
  type QueuedExpense,
  type SendOutcome,
} from "./expense-queue";
import { outcomeForError } from "./expense-sync";
import { ExpenseWriteError } from "./expense-service";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => {
      data[key] = value;
    },
  };
}

function bookEntry(requestId: string, tenantId = "t1", amountCents = 12_000): NewQueuedExpense {
  return {
    tenantId,
    categoryName: "Ice (Yelo)",
    payload: {
      kind: "book",
      createdByName: "Ana",
      draft: {
        amountCents,
        categoryId: "cat-ice",
        spentOn: "2026-10-21",
        paidFrom: "cash",
        outletId: null,
        clientRequestId: requestId,
      },
    },
  };
}

function drawerEntry(requestId: string, shiftId: string, amountCents: number, userId?: string): NewQueuedExpense {
  return {
    tenantId: "t1",
    ...(userId ? { userId } : {}),
    categoryName: "Gas / LPG",
    payload: {
      kind: "drawer",
      input: { shiftId, amountCents, categoryId: "cat-lpg", clientRequestId: requestId, recordedByName: "Ana" },
    },
  };
}

describe("expense queue", () => {
  it("keeps an entry on the phone before anything is sent, keyed by its request id", async () => {
    // Arrange
    const storage = memoryStorage();
    const queue = createExpenseQueue({ storage, send: jest.fn(), now: () => 1_000 });

    // Act
    const kept = await queue.enqueue(bookEntry("req-1"));

    // Assert
    expect(kept.id).toBe("req-1");
    expect(parseExpenseQueue(storage.data[EXPENSE_QUEUE_STORAGE_KEY])).toEqual([kept]);
    expect(kept).toMatchObject({ attempts: 0, retryAt: null, refusedReason: null, createdAt: 1_000 });
  });

  it("never queues the same request twice (a double tap or a replayed save)", async () => {
    const queue = createExpenseQueue({ storage: memoryStorage(), send: jest.fn() });
    const first = await queue.enqueue(bookEntry("req-1"));
    const second = await queue.enqueue(bookEntry("req-1", "t1", 99_900));

    expect(second).toEqual(first);
    expect(await queue.pending()).toHaveLength(1);
  });

  it("forgets what landed and reports the server ids", async () => {
    const send = jest.fn(async (entry: QueuedExpense): Promise<SendOutcome> => ({
      status: "sent",
      expenseId: `srv-${entry.id}`,
    }));
    const queue = createExpenseQueue({ storage: memoryStorage(), send });
    await queue.enqueue(bookEntry("req-1"));
    await queue.enqueue(bookEntry("req-2"));

    const result = await queue.flush("t1");

    expect([...result.sent.entries()]).toEqual([
      ["req-1", "srv-req-1"],
      ["req-2", "srv-req-2"],
    ]);
    expect(result.waiting).toBe(0);
    expect(await queue.pending()).toEqual([]);
  });

  it("sends in the order things were typed", async () => {
    const order: string[] = [];
    const queue = createExpenseQueue({
      storage: memoryStorage(),
      send: async (entry) => {
        order.push(entry.id);
        return { status: "sent", expenseId: entry.id };
      },
    });
    await queue.enqueue(drawerEntry("a", "shift-1", 100));
    await queue.enqueue(drawerEntry("b", "shift-1", 200));
    await queue.enqueue(drawerEntry("c", "shift-1", 300));

    await queue.flush("t1");

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("backs off after a failure that may not have landed, and waits until it is due", async () => {
    let now = 10_000;
    const send = jest.fn(async (): Promise<SendOutcome> => ({ status: "retry" }));
    const queue = createExpenseQueue({ storage: memoryStorage(), send, now: () => now });
    await queue.enqueue(bookEntry("req-1"));

    const first = await queue.flush("t1");
    const [waiting] = await queue.pending();
    expect(first.waiting).toBe(1);
    expect(waiting.attempts).toBe(1);
    expect(waiting.retryAt).toBe(nextExpenseRetryAt(10_000, 1));

    // Not due yet: not tried again.
    await queue.flush("t1");
    expect(send).toHaveBeenCalledTimes(1);

    now = waiting.retryAt as number;
    await queue.flush("t1");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("treats a thrown send as 'may not have landed', never as lost", async () => {
    const queue = createExpenseQueue({
      storage: memoryStorage(),
      send: async () => {
        throw new Error("Network request failed");
      },
    });
    await queue.enqueue(bookEntry("req-1"));

    await queue.flush("t1");

    expect(await queue.pending()).toHaveLength(1);
  });

  it("keeps a refused entry with its reason and stops retrying it", async () => {
    const send = jest.fn(async (): Promise<SendOutcome> => ({
      status: "refused",
      reason: "This drawer is already closed. Open a drawer first.",
    }));
    const queue = createExpenseQueue({ storage: memoryStorage(), send });
    await queue.enqueue(drawerEntry("req-1", "shift-1", 125_000));

    const result = await queue.flush("t1");
    await queue.flush("t1");

    expect(result.refused).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const [entry] = await queue.pending();
    expect(entry.refusedReason).toMatch(/already closed/);
  });

  it("never abandons money for running out of attempts", async () => {
    let now = 0;
    const queue = createExpenseQueue({
      storage: memoryStorage(),
      send: async () => ({ status: "retry" }),
      now: () => now,
    });
    await queue.enqueue(bookEntry("req-1"));
    for (let i = 0; i < 120; i += 1) {
      await queue.flush("t1");
      now += 60 * 60_000;
    }
    const [entry] = await queue.pending();
    expect(entry.attempts).toBe(120);
    expect(entry.refusedReason).toBeNull();
  });

  it("only sends this store's entries (the session token is this store's)", async () => {
    const send = jest.fn(async (entry: QueuedExpense): Promise<SendOutcome> => ({ status: "sent", expenseId: entry.id }));
    const queue = createExpenseQueue({ storage: memoryStorage(), send });
    await queue.enqueue(bookEntry("mine", "t1"));
    await queue.enqueue(bookEntry("theirs", "t2"));

    await queue.flush("t1");

    expect(send).toHaveBeenCalledTimes(1);
    expect((await queue.pending()).map((entry) => entry.id)).toEqual(["theirs"]);
  });

  it("makes waiting entries due at once on a retry tap, and forgets a dismissed one", async () => {
    const now = 0;
    const send = jest.fn(async (): Promise<SendOutcome> => ({ status: "retry" }));
    const queue = createExpenseQueue({ storage: memoryStorage(), send, now: () => now });
    await queue.enqueue(bookEntry("req-1"));
    await queue.flush("t1");

    await queue.retryNow("t1");
    expect((await queue.pending())[0].retryAt).toBeNull();

    await queue.remove("req-1");
    expect(await queue.pending()).toEqual([]);
  });

  it("drops damaged stored entries instead of refusing the whole queue", () => {
    const good = { ...bookEntry("ok"), id: "ok", attempts: 0, retryAt: null, createdAt: 1, refusedReason: null };
    const raw = JSON.stringify([good, { id: 3 }, null]);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(parseExpenseQueue(raw)).toEqual([good]);
    expect(parseExpenseQueue("{not json")).toEqual([]);
    warn.mockRestore();
  });

  it("adds up a shift's waiting drawer expenses, ignoring other shifts and the book", async () => {
    const queue = createExpenseQueue({ storage: memoryStorage(), send: jest.fn() });
    await queue.enqueue(drawerEntry("a", "shift-1", 12_000));
    await queue.enqueue(drawerEntry("b", "shift-1", 125_000));
    await queue.enqueue(drawerEntry("c", "shift-2", 5_000));
    await queue.enqueue(bookEntry("d"));

    expect(pendingDrawerCents(await queue.pending(), "shift-1")).toEqual({ cents: 137_000, count: 2 });
  });
});

describe("outcomeForError", () => {
  it("retries anything that may not have reached the server", () => {
    expect(outcomeForError(new ExpenseWriteError("offline", { isNetwork: true }))).toEqual({ status: "retry" });
    expect(outcomeForError(new Error("boom"))).toEqual({ status: "retry" });
    expect(outcomeForError(new ExpenseWriteError("server hiccup", { code: "57014" }))).toEqual({ status: "retry" });
  });

  it("keeps waiting while the store's database has no expenses yet", () => {
    expect(outcomeForError(new ExpenseWriteError("not set up", { code: "PGRST202" }))).toEqual({ status: "retry" });
  });

  it("stops on a refusal the server will repeat", () => {
    for (const code of ["42501", "22023", "23514", "P0001"]) {
      expect(outcomeForError(new ExpenseWriteError("no", { code }))).toEqual({ status: "refused", reason: "no" });
    }
  });
});

describe("the Undo window", () => {
  it("holds a fresh entry unsent until it is released, and Undo simply forgets it", async () => {
    let now = 1_000;
    const send = jest.fn(async (entry: QueuedExpense): Promise<SendOutcome> => ({ status: "sent", expenseId: entry.id }));
    const queue = createExpenseQueue({ storage: memoryStorage(), send, now: () => now });

    await queue.enqueue(bookEntry("kept"), { holdMs: 6_000 });
    await queue.enqueue(bookEntry("undone"), { holdMs: 6_000 });
    await queue.flush("t1");
    expect(send).not.toHaveBeenCalled();

    expect(await queue.remove("undone")).toBe(true);
    await queue.release("kept");
    await queue.flush("t1");

    expect(send.mock.calls.map(([entry]) => entry.id)).toEqual(["kept"]);
    expect(await queue.remove("kept")).toBe(false);
    now += 1;
  });
});

describe("refused drawer pay-outs", () => {
  it("does not count a refused pay-out as waiting: it will never sync on its own", async () => {
    // Arrange
    const send = jest.fn(async (entry: QueuedExpense): Promise<SendOutcome> =>
      entry.id === "b" ? { status: "refused", reason: "This category was removed." } : { status: "retry" },
    );
    const queue = createExpenseQueue({ storage: memoryStorage(), send });
    await queue.enqueue(drawerEntry("a", "shift-1", 12_000));
    await queue.enqueue(drawerEntry("b", "shift-1", 5_000));

    // Act
    await queue.flush("t1");
    const entries = await queue.pending();

    // Assert
    expect(pendingDrawerCents(entries, "shift-1")).toEqual({ cents: 12_000, count: 1 });
    expect(refusedDrawerPayouts(entries, "shift-1")).toEqual([
      { id: "b", categoryName: "Gas / LPG", cents: 5_000, reason: "This category was removed." },
    ]);
    expect(refusedDrawerPayouts(entries, "shift-2")).toEqual([]);
  });

  it("sends a refused entry again on Try again", async () => {
    let answer: SendOutcome = { status: "refused", reason: "Not allowed" };
    const queue = createExpenseQueue({ storage: memoryStorage(), send: async () => answer });
    await queue.enqueue(drawerEntry("a", "shift-1", 12_000));
    await queue.flush("t1");

    answer = { status: "sent", expenseId: "srv-a" };
    await queue.retryRefused("a");
    const result = await queue.flush("t1");

    expect([...result.sent.keys()]).toEqual(["a"]);
    expect(await queue.pending()).toEqual([]);
  });
});

describe("whose entries a flush sends (a shared register)", () => {
  it("sends only the signed-in person's entries and parks everyone else's", async () => {
    // Arrange: Ana paid ice offline, then Ben signed in on the same phone.
    const send = jest.fn(async (entry: QueuedExpense): Promise<SendOutcome> => ({ status: "sent", expenseId: entry.id }));
    const queue = createExpenseQueue({ storage: memoryStorage(), send });
    await queue.enqueue(drawerEntry("ana-ice", "shift-ana", 2_000, "ana"));
    await queue.enqueue(drawerEntry("ben-lpg", "shift-ben", 9_000, "ben"));

    // Act
    const result = await queue.flush("t1", "ben");

    // Assert
    expect(send.mock.calls.map(([entry]) => entry.id)).toEqual(["ben-lpg"]);
    expect(result).toMatchObject({ waiting: 0, refused: 0 });
    expect((await queue.pending("t1", "ben")).map((entry) => entry.id)).toEqual([]);
    expect((await queue.pending("t1", "ana")).map((entry) => entry.id)).toEqual(["ana-ice"]);
  });

  it("stamps the person on a new entry and treats an older entry without one as the signed-in person's", async () => {
    const send = jest.fn(async (entry: QueuedExpense): Promise<SendOutcome> => ({ status: "sent", expenseId: entry.id }));
    const legacy = { ...bookEntry("old"), id: "old", attempts: 0, retryAt: null, createdAt: 1, refusedReason: null };
    const storage = memoryStorage({ [EXPENSE_QUEUE_STORAGE_KEY]: JSON.stringify([legacy]) });
    const queue = createExpenseQueue({ storage, send });

    const kept = await queue.enqueue({ ...bookEntry("new"), userId: "ana" });
    await queue.flush("t1", "ana");

    expect(kept.userId).toBe("ana");
    expect(send.mock.calls.map(([entry]) => entry.id)).toEqual(["old", "new"]);
  });
});

/** A send that waits until the test lets it answer. */
function gatedSend() {
  const gates: { id: string; open: (outcome: SendOutcome) => void }[] = [];
  const send = jest.fn(
    (entry: QueuedExpense) =>
      new Promise<SendOutcome>((resolve) => {
        gates.push({ id: entry.id, open: resolve });
      }),
  );
  const waitForSend = async (count: number) => {
    for (let i = 0; i < 50 && gates.length < count; i += 1) await new Promise((resolve) => setImmediate(resolve));
    expect(gates.length).toBeGreaterThanOrEqual(count);
  };
  return { send, gates, waitForSend };
}

describe("saving while a sync is sending", () => {
  it("keeps a new save prompt and intact while an earlier entry is still on the wire", async () => {
    // Arrange
    const { send, gates, waitForSend } = gatedSend();
    const queue = createExpenseQueue({ storage: memoryStorage(), send });
    await queue.enqueue(bookEntry("first"));
    const flushing = queue.flush("t1");
    await waitForSend(1);

    // Act: a save lands while "first" is still being sent.
    const second = await queue.enqueue(bookEntry("second"), { holdMs: 6_000 });
    gates[0].open({ status: "sent", expenseId: "srv-first" });
    const result = await flushing;

    // Assert
    expect(second.id).toBe("second");
    expect([...result.sent.keys()]).toEqual(["first"]);
    expect((await queue.pending()).map((entry) => entry.id)).toEqual(["second"]);
  });

  it("an Undo that races the send waits for it, then says it had already left the phone", async () => {
    const { send, gates, waitForSend } = gatedSend();
    const queue = createExpenseQueue({ storage: memoryStorage(), send });
    await queue.enqueue(bookEntry("racing"));
    const flushing = queue.flush("t1");
    await waitForSend(1);

    const removing = queue.remove("racing");
    gates[0].open({ status: "sent", expenseId: "srv" });

    expect(await removing).toBe(false);
    await flushing;
    expect(await queue.pending()).toEqual([]);
  });

  it("forgets an entry removed before its turn on the wire, without sending it", async () => {
    const { send, gates, waitForSend } = gatedSend();
    const queue = createExpenseQueue({ storage: memoryStorage(), send });
    await queue.enqueue(bookEntry("a"));
    await queue.enqueue(bookEntry("b"));
    const flushing = queue.flush("t1");
    await waitForSend(1);

    expect(await queue.remove("b")).toBe(true);
    gates[0].open({ status: "sent", expenseId: "srv-a" });
    await flushing;

    expect(send.mock.calls.map(([entry]) => entry.id)).toEqual(["a"]);
    expect(await queue.pending()).toEqual([]);
  });

  it("never sends the same entry twice when two flushes overlap", async () => {
    const { send, gates, waitForSend } = gatedSend();
    const queue = createExpenseQueue({ storage: memoryStorage(), send });
    await queue.enqueue(bookEntry("a"));

    const one = queue.flush("t1");
    await waitForSend(1);
    const two = queue.flush("t1");
    gates[0].open({ status: "sent", expenseId: "srv-a" });
    await Promise.all([one, two]);

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("createSingleFlight", () => {
  it("runs one more pass when asked again during a running pass, and shares its answer", async () => {
    // Arrange
    let release: () => void = () => undefined;
    const passes: string[] = [];
    const run = jest.fn(async (key: string) => {
      passes.push(key);
      if (passes.length === 1) await new Promise<void>((resolve) => (release = resolve));
      return passes.length;
    });
    const flight = createSingleFlight(run, (_earlier: number, later: number) => later);

    // Act
    const first = flight("t1");
    const second = flight("t1");
    release();

    // Assert
    expect(await first).toBe(2);
    expect(await second).toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never makes one store wait on another store's pass", async () => {
    let release: () => void = () => undefined;
    const run = jest.fn(async (key: string) => {
      if (key === "slow") await new Promise<void>((resolve) => (release = resolve));
      return key;
    });
    const flight = createSingleFlight(run, (_a: string, b: string) => b);

    const slow = flight("slow");
    expect(await flight("fast")).toBe("fast");
    release();
    expect(await slow).toBe("slow");
  });
});
