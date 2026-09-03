// The pre-order reminder planner. A scheduled order rings once when it lands
// (the normal new-order alert) and then goes quiet — possibly for days. This
// plans the second ring: a local notification at lead time before the
// requested moment, reconciled the same way the SMS campaign reminders are
// (lib/sms/due-notifications.ts): keyed on order + requested instant so a
// re-scheduled order cancels its stale reminder, deduped against what this
// device already scheduled, dead orders cancelled.
import { readFileSync } from "fs";
import { join } from "path";

import {
  planScheduledReminders,
  reminderKey,
  REMINDER_LEAD_MINUTES,
} from "./scheduled-reminders";

const atLocal = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m, d, h, min);
const isoLocal = (y: number, m: number, d: number, h: number, min = 0) =>
  atLocal(y, m, d, h, min).toISOString();

const NOW = atLocal(2026, 5, 18, 10, 0).getTime();
const MS_PER_MINUTE = 60_000;

const order = (
  id: string,
  overrides: Partial<{
    status: string;
    scheduledFor: string | null;
    customerName: string;
    itemCount: number;
    customerData: Record<string, unknown> | null;
  }> = {},
) => ({
  _id: id,
  status: "confirmed",
  scheduledFor: null,
  customerName: "Maria Cruz",
  itemCount: 4,
  customerData: null,
  ...overrides,
});

describe("planScheduledReminders", () => {
  it("schedules a reminder lead-time ahead of the requested moment", () => {
    const iso = isoLocal(2026, 5, 18, 17, 30);
    const plan = planScheduledReminders({
      orders: [order("a", { scheduledFor: iso })],
      knownKeys: [],
      nowMs: NOW,
    });

    expect(plan.schedule).toHaveLength(1);
    const reminder = plan.schedule[0];
    expect(reminder.key).toBe(reminderKey("a", iso));
    expect(reminder.orderId).toBe("a");
    expect(reminder.fireAtMs).toBe(
      atLocal(2026, 5, 18, 17, 30).getTime() - REMINDER_LEAD_MINUTES * MS_PER_MINUTE,
    );
    expect(reminder.body).toContain("Maria Cruz");
    expect(plan.keepKeys).toEqual([reminderKey("a", iso)]);
    expect(plan.cancelKeys).toEqual([]);
  });

  it("fires immediately when the lead window has already started or passed", () => {
    const inside = isoLocal(2026, 5, 18, 10, 15);
    const missed = isoLocal(2026, 5, 18, 9, 0);
    const plan = planScheduledReminders({
      orders: [
        order("inside", { scheduledFor: inside }),
        order("missed", { scheduledFor: missed }),
      ],
      knownKeys: [],
      nowMs: NOW,
    });
    expect(plan.schedule.map((r) => r.fireAtMs)).toEqual([NOW, NOW]);
  });

  it("never re-schedules an occurrence this device already knows", () => {
    const iso = isoLocal(2026, 5, 18, 17, 30);
    const plan = planScheduledReminders({
      orders: [order("a", { scheduledFor: iso })],
      knownKeys: [reminderKey("a", iso)],
      nowMs: NOW,
    });
    expect(plan.schedule).toEqual([]);
    expect(plan.keepKeys).toEqual([reminderKey("a", iso)]);
  });

  it("cancels reminders whose order completed, cancelled, or re-scheduled", () => {
    const oldIso = isoLocal(2026, 5, 18, 17, 30);
    const newIso = isoLocal(2026, 5, 18, 19, 0);
    const plan = planScheduledReminders({
      orders: [order("moved", { scheduledFor: newIso })],
      knownKeys: [reminderKey("moved", oldIso), reminderKey("done", oldIso)],
      nowMs: NOW,
    });
    expect(plan.cancelKeys.sort()).toEqual(
      [reminderKey("done", oldIso), reminderKey("moved", oldIso)].sort(),
    );
    expect(plan.schedule.map((r) => r.key)).toEqual([reminderKey("moved", newIso)]);
  });

  it("ignores ASAP orders and terminal statuses entirely", () => {
    const plan = planScheduledReminders({
      orders: [
        order("asap"),
        order("done", { status: "delivered", scheduledFor: isoLocal(2026, 5, 18, 17, 0) }),
      ],
      knownKeys: [],
      nowMs: NOW,
    });
    expect(plan.schedule).toEqual([]);
    expect(plan.keepKeys).toEqual([]);
  });

  it("honors a custom lead time", () => {
    const iso = isoLocal(2026, 5, 18, 17, 30);
    const plan = planScheduledReminders({
      orders: [order("a", { scheduledFor: iso })],
      knownKeys: [],
      nowMs: NOW,
      leadMinutes: 120,
    });
    expect(plan.schedule[0].fireAtMs).toBe(
      atLocal(2026, 5, 18, 17, 30).getTime() - 120 * MS_PER_MINUTE,
    );
  });
});

describe("reminder wiring", () => {
  // Jest runs pure-logic roots only, so like the mount guardrails this pins
  // the wiring in source: the app-wide alert host is the one place already
  // watching the live queue on every tab, so the reminder sync rides it.
  const source = readFileSync(
    join(__dirname, "..", "components", "GlobalOrderAlerts.tsx"),
    "utf8",
  );

  it("syncs reminders from the app-wide alert host", () => {
    expect(source).toMatch(/syncScheduledOrderReminders/);
  });

  it("keeps the demo session from scheduling reminders for a real store", () => {
    expect(source).toMatch(/shouldAlertOnNewOrders/);
  });
});
