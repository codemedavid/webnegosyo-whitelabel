import {
  BILL_ALERTS_STORAGE_KEY,
  clearBillAlerts,
  ensurePermission,
  planBillAlerts,
  reminderOwner,
  subscribeBillReminderResync,
  syncBillAlerts,
  type BillAlert,
  type BillAlertNotifier,
  type BillAlertStore,
  type ReminderOwnerInput,
  type ReminderPermission,
} from "./bill-alerts";
import { BILL_NOW_MS, RENT_PAID_UP, billPayment, makeBill } from "./bill-test-fixtures";

// ── Fakes ────────────────────────────────────────────────────────────────────

function fakeNotifier(permission: ReminderPermission = "granted", others: string[] = []) {
  const scheduled = new Map<string, BillAlert>(others.map((id) => [id, { id } as BillAlert]));
  const calls = { schedule: [] as string[], cancel: [] as string[], prompts: 0, channels: 0 };
  let current = permission;
  let promptAnswer: ReminderPermission = "granted";
  let isListBroken = false;
  const notifier: BillAlertNotifier = {
    permission: async () => current,
    requestPermission: async () => {
      calls.prompts += 1;
      current = promptAnswer;
      return current;
    },
    ensureChannel: async () => {
      calls.channels += 1;
    },
    scheduledIds: async () => {
      if (isListBroken) throw new Error("native list failed");
      return [...scheduled.keys()];
    },
    schedule: async (alert) => {
      calls.schedule.push(alert.id);
      scheduled.set(alert.id, alert);
    },
    cancel: async (id) => {
      calls.cancel.push(id);
      scheduled.delete(id);
    },
  };
  return {
    notifier,
    scheduled,
    calls,
    setPermission: (next: ReminderPermission) => (current = next),
    answerPromptWith: (answer: ReminderPermission) => (promptAnswer = answer),
    breakList: () => (isListBroken = true),
  };
}

function fakeStore(initial: Record<string, string> = {}): BillAlertStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

const OWNER = "tenant-1:user-1";
const rentBoard = { bills: [makeBill()], marks: [], payments: RENT_PAID_UP };

// ── Who ──────────────────────────────────────────────────────────────────────

describe("reminderOwner", () => {
  const signedIn: ReminderOwnerInput = {
    isLoading: false,
    isAuthenticated: true,
    isDemo: false,
    impersonatedTenantId: null,
    tenantId: "tenant-1",
    userId: "user-1",
    canManageExpenses: true,
  };

  test("an owner or manager with the expenses key gets reminders for their store", () => {
    expect(reminderOwner(signedIn)).toEqual({ kind: "owner", tenantId: "tenant-1", userId: "user-1", key: OWNER });
  });

  test("waits while sign-in is still loading, so an offline cold start never wipes the reminders", () => {
    expect(reminderOwner({ ...signedIn, isLoading: true, tenantId: null })).toEqual({ kind: "wait" });
  });

  test("never a cashier, the demo, a superadmin viewing a store, or a signed-out phone", () => {
    expect(reminderOwner({ ...signedIn, canManageExpenses: false }).kind).toBe("none");
    expect(reminderOwner({ ...signedIn, isDemo: true }).kind).toBe("none");
    expect(reminderOwner({ ...signedIn, impersonatedTenantId: "tenant-2" }).kind).toBe("none");
    expect(reminderOwner({ ...signedIn, isAuthenticated: false }).kind).toBe("none");
    expect(reminderOwner({ ...signedIn, tenantId: null }).kind).toBe("none");
  });
});

// ── What ─────────────────────────────────────────────────────────────────────

describe("planBillAlerts", () => {
  test("rent due 5 November reminds 3 days before, at 08:00 Manila, and opens that bill", () => {
    // Act
    const alerts = planBillAlerts(rentBoard, BILL_NOW_MS);

    // Assert
    expect(alerts).toEqual([
      {
        id: "bill-reminder-2026-11-02",
        fireAtMs: Date.parse("2026-11-02T08:00:00+08:00"),
        title: "Rent is due in 3 days · ₱15,000",
        body: "Tap to mark it paid.",
        data: { type: "bill_reminder", billIds: ["bill-rent"], url: "/(main)/expense-bills?bill=bill-rent" },
      },
    ]);
  });

  test("drops a morning whose 08:00 has already passed instead of firing it at once", () => {
    // Arrange: power is due today (no lead), and it is already 10:00.
    const power = makeBill({ id: "bill-power", name: "Kuryente", rule: { kind: "monthly", day: 22 }, remindDaysBefore: 0, amountCents: 620_000 });
    const board = { bills: [power], marks: [], payments: [billPayment("2026-08-22", 620_000, "bill-power"), billPayment("2026-09-22", 620_000, "bill-power")] };

    // Act
    const ids = planBillAlerts(board, BILL_NOW_MS).map((alert) => alert.id);

    // Assert: the morning-after and three-days-after nudges stay.
    expect(ids).toEqual(["bill-reminder-2026-10-23", "bill-reminder-2026-10-25"]);
  });

  test("a bundled morning opens the list, never one bill", () => {
    const water = makeBill({ id: "bill-water", name: "Tubig", rule: { kind: "monthly", day: 5 }, amountCents: 80_000 });
    const board = {
      bills: [makeBill(), water],
      marks: [],
      payments: [...RENT_PAID_UP, billPayment("2026-10-05", 80_000, "bill-water")],
    };

    const [alert] = planBillAlerts(board, BILL_NOW_MS);

    expect(alert.data).toEqual({ type: "bill_reminder", billIds: ["bill-rent", "bill-water"], url: "/(main)/expense-bills" });
    expect(alert.title).toBe("2 bills this week · ₱15,800");
  });

  test("an ended bill reminds of nothing", () => {
    expect(planBillAlerts({ ...rentBoard, bills: [makeBill({ status: "ended" })] }, BILL_NOW_MS)).toEqual([]);
  });
});

// ── Sync ─────────────────────────────────────────────────────────────────────

describe("syncBillAlerts", () => {
  test("schedules the plan once and records it for this account", async () => {
    // Arrange
    const phone = fakeNotifier();
    const store = fakeStore();
    const alerts = planBillAlerts(rentBoard, BILL_NOW_MS);

    // Act
    const result = await syncBillAlerts(OWNER, alerts, { notifier: phone.notifier, store });

    // Assert
    expect(result).toEqual({ scheduled: ["bill-reminder-2026-11-02"], cancelled: [], permission: "granted" });
    expect(phone.calls.channels).toBe(1);
    expect(JSON.parse(store.data.get(BILL_ALERTS_STORAGE_KEY) as string).owner).toBe(OWNER);
  });

  test("a second sync with nothing changed touches nothing", async () => {
    const phone = fakeNotifier();
    const store = fakeStore();
    const alerts = planBillAlerts(rentBoard, BILL_NOW_MS);
    await syncBillAlerts(OWNER, alerts, { notifier: phone.notifier, store });

    const result = await syncBillAlerts(OWNER, alerts, { notifier: phone.notifier, store });

    expect(result).toEqual({ scheduled: [], cancelled: [], permission: "granted" });
    expect(phone.calls.schedule).toHaveLength(1);
  });

  test("a paid bill's reminder is cancelled; other features' notifications are never touched", async () => {
    const phone = fakeNotifier("granted", ["sms-due-1", "scheduled-order-9"]);
    const store = fakeStore();
    await syncBillAlerts(OWNER, planBillAlerts(rentBoard, BILL_NOW_MS), { notifier: phone.notifier, store });

    const result = await syncBillAlerts(OWNER, [], { notifier: phone.notifier, store });

    expect(result?.cancelled).toEqual(["bill-reminder-2026-11-02"]);
    expect([...phone.scheduled.keys()].sort()).toEqual(["scheduled-order-9", "sms-due-1"]);
  });

  test("changed words are re-made under the same id", async () => {
    const phone = fakeNotifier();
    const store = fakeStore();
    const [alert] = planBillAlerts(rentBoard, BILL_NOW_MS);
    await syncBillAlerts(OWNER, [alert], { notifier: phone.notifier, store });

    const result = await syncBillAlerts(OWNER, [{ ...alert, title: "Rent is due in 3 days · ₱16,000" }], { notifier: phone.notifier, store });

    expect(result).toMatchObject({ scheduled: [alert.id], cancelled: [] });
    expect(phone.calls.cancel).toEqual([alert.id]);
    expect(phone.scheduled.get(alert.id)?.title).toBe("Rent is due in 3 days · ₱16,000");
  });

  test("after a store switch the other store's reminders go, even on the same mornings", async () => {
    // Arrange: store A's reminder is on the phone.
    const phone = fakeNotifier();
    const store = fakeStore();
    const [alert] = planBillAlerts(rentBoard, BILL_NOW_MS);
    await syncBillAlerts("tenant-A:user-1", [alert, { ...alert, id: "bill-reminder-2026-11-03" }], { notifier: phone.notifier, store });

    // Act: store B wants the same morning (same id) with the same words.
    const result = await syncBillAlerts("tenant-B:user-1", [alert], { notifier: phone.notifier, store });

    // Assert: the shared morning is re-made for B, A's other morning is gone.
    expect(result?.scheduled).toEqual([alert.id]);
    expect(result?.cancelled).toEqual(["bill-reminder-2026-11-03"]);
  });

  test("without permission it schedules nothing and never asks", async () => {
    const phone = fakeNotifier("undetermined");
    const store = fakeStore();

    const result = await syncBillAlerts(OWNER, planBillAlerts(rentBoard, BILL_NOW_MS), { notifier: phone.notifier, store });

    expect(result).toEqual({ scheduled: [], cancelled: [], permission: "undetermined" });
    expect(phone.calls.prompts).toBe(0);
  });

  test("falls back to its own record when the phone cannot list what it holds", async () => {
    const phone = fakeNotifier();
    const store = fakeStore();
    await syncBillAlerts(OWNER, planBillAlerts(rentBoard, BILL_NOW_MS), { notifier: phone.notifier, store });
    phone.breakList();

    const result = await syncBillAlerts(OWNER, [], { notifier: phone.notifier, store });

    expect(result?.cancelled).toEqual(["bill-reminder-2026-11-02"]);
  });

  test("never throws: a broken store reads as nothing known", async () => {
    const phone = fakeNotifier();
    const store = fakeStore({ [BILL_ALERTS_STORAGE_KEY]: "{not json" });

    const result = await syncBillAlerts(OWNER, planBillAlerts(rentBoard, BILL_NOW_MS), { notifier: phone.notifier, store });

    expect(result?.scheduled).toEqual(["bill-reminder-2026-11-02"]);
  });
});

describe("clearBillAlerts", () => {
  test("cancels every bill reminder on the phone and forgets the record, nothing else", async () => {
    // Arrange: one reminder this account scheduled, one an older build left behind.
    const phone = fakeNotifier("granted", ["sms-due-1"]);
    const store = fakeStore();
    await syncBillAlerts(OWNER, planBillAlerts(rentBoard, BILL_NOW_MS), { notifier: phone.notifier, store });
    phone.scheduled.set("bill-reminder-2026-10-30", { id: "bill-reminder-2026-10-30" } as BillAlert);

    const cancelled = await clearBillAlerts({ notifier: phone.notifier, store });

    expect(cancelled.sort()).toEqual(["bill-reminder-2026-10-30", "bill-reminder-2026-11-02"]);
    expect([...phone.scheduled.keys()]).toEqual(["sms-due-1"]);
    expect(store.data.has(BILL_ALERTS_STORAGE_KEY)).toBe(false);
  });
});

describe("ensurePermission", () => {
  test("already granted: no prompt", async () => {
    const phone = fakeNotifier("granted");
    await expect(ensurePermission(phone.notifier)).resolves.toBe(true);
    expect(phone.calls.prompts).toBe(0);
  });

  test("refused before: respects it, no prompt", async () => {
    const phone = fakeNotifier("denied");
    await expect(ensurePermission(phone.notifier)).resolves.toBe(false);
    expect(phone.calls.prompts).toBe(0);
  });

  test("never asked: asks once, and a yes re-plans the reminders", async () => {
    // Arrange
    const phone = fakeNotifier("undetermined");
    const resync = jest.fn();
    const unsubscribe = subscribeBillReminderResync(resync);

    // Act
    const isGranted = await ensurePermission(phone.notifier);
    unsubscribe();

    // Assert
    expect(isGranted).toBe(true);
    expect(phone.calls.prompts).toBe(1);
    expect(resync).toHaveBeenCalledTimes(1);
  });

  test("a no at the prompt schedules nothing and does not re-plan", async () => {
    const phone = fakeNotifier("undetermined");
    phone.answerPromptWith("denied");
    const resync = jest.fn();
    const unsubscribe = subscribeBillReminderResync(resync);

    await expect(ensurePermission(phone.notifier)).resolves.toBe(false);
    unsubscribe();

    expect(resync).not.toHaveBeenCalled();
  });
});
