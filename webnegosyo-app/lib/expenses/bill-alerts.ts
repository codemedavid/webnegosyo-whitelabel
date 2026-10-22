/**
 * Bills to pay — phone reminders (bills-contract §3, recurring-bills.md
 * "Reminders"). v1 is LOCAL notifications on the owner's own phone at 08:00
 * Manila: the plan is the shared engine's `reminderPlan`; this module decides
 * WHO gets them, turns the plan into notifications, and keeps the phone's
 * scheduled set equal to it.
 *
 * Native calls are injected (`BillAlertPorts`), so all of it runs under the
 * node suite; `bill-alerts-device.ts` binds expo-notifications + AsyncStorage.
 *
 * Rules:
 *  - Only an account that manages expenses, signed in to its own store: never
 *    a cashier, never the demo, never a superadmin viewing another store.
 *  - The default notification sound on its own channel — NEVER the `orders`
 *    channel or its ringtone (a bill must not sound like a customer).
 *  - Identifiers are the engine's `bill-reminder-<fireOn>`: one per morning.
 *    Every sync cancels whatever this phone holds under that prefix and the
 *    plan no longer wants, so a store switch or a paid bill never leaves a
 *    stale reminder behind.
 *  - Permission is asked ONLY through `ensurePermission`, at a natural moment
 *    (after the first bill is saved). A sync never prompts: granted =
 *    schedule quietly, anything else = schedule nothing.
 *  - Never throws: it runs beside every screen.
 */

import { billsDue, type BillMark, type BillPayment, type Bill } from "./bill-schedule";
import { DEFAULT_REMINDER_HORIZON_DAYS, reminderPlan } from "./bill-reminders";
import { BILL_REMINDER_PUSH_TYPE, billsHref } from "./bill-links";
import { manilaToday } from "./expense-format";

export const BILL_REMINDER_ID_PREFIX = "bill-reminder-";
/** Android channel: default importance and sound, its own name in Settings. */
export const BILL_REMINDER_CHANNEL_ID = "bill-reminders";
export const BILL_REMINDER_CHANNEL_NAME = "Bill reminders";
/** What this phone scheduled, and for whom (`<tenant>:<user>`). */
export const BILL_ALERTS_STORAGE_KEY = "bills.reminders.v1";

// ── Who ──────────────────────────────────────────────────────────────────────

export type ReminderOwner =
  /** Auth is still loading: touch nothing (an offline cold start must not wipe the set). */
  | { kind: "wait" }
  /** Signed out, or an account that must not get bill reminders: clear them. */
  | { kind: "none" }
  | { kind: "owner"; tenantId: string; userId: string; key: string };

export interface ReminderOwnerInput {
  isLoading: boolean;
  isAuthenticated: boolean;
  isDemo: boolean;
  /** A superadmin viewing a store: that store's bills are not theirs to be reminded of. */
  impersonatedTenantId: string | null;
  tenantId: string | null;
  userId: string | null;
  /** The `expenses` key (`useCanManageExpenses`). Cashiers never have it. */
  canManageExpenses: boolean;
}

export function reminderOwner(input: ReminderOwnerInput): ReminderOwner {
  if (input.isLoading) return { kind: "wait" };
  if (!input.isAuthenticated || !input.tenantId || !input.userId) return { kind: "none" };
  if (input.isDemo || input.impersonatedTenantId !== null || !input.canManageExpenses) return { kind: "none" };
  return { kind: "owner", tenantId: input.tenantId, userId: input.userId, key: `${input.tenantId}:${input.userId}` };
}

// ── What ─────────────────────────────────────────────────────────────────────

export interface BillAlertData {
  type: typeof BILL_REMINDER_PUSH_TYPE;
  billIds: string[];
  /** For readers of the payload; the tap is routed from `billIds` (bill-links.ts). */
  url: string;
}

export interface BillAlert {
  /** `bill-reminder-<fireOn>`. */
  id: string;
  fireAtMs: number;
  title: string;
  body: string;
  data: BillAlertData;
}

/** The bills plus their marks and payments (`readBillBoard`). */
export interface BillAlertBoard {
  bills: readonly Bill[];
  marks: readonly BillMark[];
  payments: readonly BillPayment[];
}

/**
 * The notifications this phone should hold now: the engine's plan for the
 * next `horizonDays`, without any morning whose 08:00 has already passed (a
 * date trigger in the past would fire the moment it is scheduled).
 */
export function planBillAlerts(
  board: BillAlertBoard,
  nowMs: number,
  horizonDays: number = DEFAULT_REMINDER_HORIZON_DAYS,
): BillAlert[] {
  const today = manilaToday(nowMs);
  const occurrences = billsDue(board.bills, { today, payments: board.payments, marks: board.marks });
  return reminderPlan(board.bills, occurrences, today, horizonDays)
    .map((reminder) => ({
      id: reminder.id,
      fireAtMs: Date.parse(reminder.fireAt),
      title: reminder.title,
      body: reminder.body,
      data: { type: BILL_REMINDER_PUSH_TYPE, billIds: reminder.billIds, url: billsHref(reminder.billIds) },
    }))
    .filter((alert) => Number.isFinite(alert.fireAtMs) && alert.fireAtMs > nowMs);
}

/** Everything that, when changed, means the notification must be re-made. */
function signatureOf(alert: BillAlert): string {
  return JSON.stringify([alert.fireAtMs, alert.title, alert.body, alert.data.billIds]);
}

// ── Ports ────────────────────────────────────────────────────────────────────

export type ReminderPermission = "granted" | "denied" | "undetermined";

export interface BillAlertNotifier {
  permission(): Promise<ReminderPermission>;
  /** Shows the system prompt; only `ensurePermission` calls it. */
  requestPermission(): Promise<ReminderPermission>;
  ensureChannel(): Promise<void>;
  /** Every identifier this phone has scheduled (any feature). */
  scheduledIds(): Promise<string[]>;
  schedule(alert: BillAlert): Promise<void>;
  cancel(id: string): Promise<void>;
}

export interface BillAlertStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface BillAlertPorts {
  notifier: BillAlertNotifier;
  store: BillAlertStore;
}

interface StoredAlerts {
  owner: string;
  /** id → signature of what was scheduled. */
  alerts: Record<string, string>;
}

const NO_STORED: StoredAlerts = { owner: "", alerts: {} };

async function readStored(store: BillAlertStore): Promise<StoredAlerts> {
  try {
    const raw = await store.getItem(BILL_ALERTS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return NO_STORED;
    const { owner, alerts } = parsed as { owner?: unknown; alerts?: unknown };
    if (typeof owner !== "string" || !alerts || typeof alerts !== "object" || Array.isArray(alerts)) return NO_STORED;
    const entries = Object.entries(alerts as Record<string, unknown>).filter(
      (entry): entry is [string, string] => entry[0].startsWith(BILL_REMINDER_ID_PREFIX) && typeof entry[1] === "string",
    );
    return { owner, alerts: Object.fromEntries(entries) };
  } catch {
    // Unreadable = nothing known: everything is re-made once, never lost.
    return NO_STORED;
  }
}

/** Bill reminders on the phone: what the OS reports, else what we last stored. */
async function billIdsOnPhone(notifier: BillAlertNotifier, stored: StoredAlerts): Promise<string[]> {
  try {
    return (await notifier.scheduledIds()).filter((id) => id.startsWith(BILL_REMINDER_ID_PREFIX));
  } catch {
    return Object.keys(stored.alerts);
  }
}

async function cancelEach(notifier: BillAlertNotifier, ids: readonly string[]): Promise<string[]> {
  const cancelled: string[] = [];
  for (const id of ids) {
    try {
      await notifier.cancel(id);
      cancelled.push(id);
    } catch {
      // Already gone (fired or cleared by the OS): nothing to undo.
    }
  }
  return cancelled;
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export interface BillAlertSyncResult {
  scheduled: string[];
  cancelled: string[];
  permission: ReminderPermission;
}

/**
 * Make the phone hold exactly `alerts` for `ownerKey`. Unchanged reminders are
 * left alone; changed ones are re-made; anything else under the prefix —
 * including another account's, after a switch — is cancelled. Without
 * permission nothing is scheduled (and nothing is asked). Null on failure.
 */
export async function syncBillAlerts(
  ownerKey: string,
  alerts: readonly BillAlert[],
  { notifier, store }: BillAlertPorts,
): Promise<BillAlertSyncResult | null> {
  try {
    const permission = await notifier.permission();
    const stored = await readStored(store);
    const known = stored.owner === ownerKey ? stored.alerts : {};
    const onPhone = new Set(await billIdsOnPhone(notifier, stored));
    const wanted = permission === "granted" ? alerts : [];
    const wantedIds = new Set(wanted.map((alert) => alert.id));
    const changed = wanted.filter((alert) => !onPhone.has(alert.id) || known[alert.id] !== signatureOf(alert));

    const stale = [...onPhone].filter((id) => !wantedIds.has(id));
    const remade = changed.map((alert) => alert.id).filter((id) => onPhone.has(id));
    const cancelled = await cancelEach(notifier, [...stale, ...remade]);

    if (changed.length > 0) await notifier.ensureChannel();
    const scheduled: string[] = [];
    const record: Record<string, string> = {};
    for (const alert of wanted) {
      const isChanged = changed.includes(alert);
      if (isChanged) {
        try {
          await notifier.schedule(alert);
          scheduled.push(alert.id);
        } catch {
          continue; // Not recorded: the next sync tries it again.
        }
      }
      record[alert.id] = signatureOf(alert);
    }
    await store.setItem(BILL_ALERTS_STORAGE_KEY, JSON.stringify({ owner: ownerKey, alerts: record }));
    return { scheduled, cancelled: cancelled.filter((id) => !scheduled.includes(id)), permission };
  } catch {
    return null;
  }
}

/** Sign-out, a store switch to an account without bills, the demo: no bill reminder stays. */
export async function clearBillAlerts({ notifier, store }: BillAlertPorts): Promise<string[]> {
  try {
    const stored = await readStored(store);
    const ids = new Set([...(await billIdsOnPhone(notifier, stored)), ...Object.keys(stored.alerts)]);
    const cancelled = await cancelEach(notifier, [...ids]);
    await store.removeItem(BILL_ALERTS_STORAGE_KEY);
    return cancelled;
  } catch {
    return [];
  }
}

// ── Permission ───────────────────────────────────────────────────────────────

const resyncListeners = new Set<() => void>();

/** `BillReminderSync` re-plans when permission is newly granted. */
export function subscribeBillReminderResync(listener: () => void): () => void {
  resyncListeners.add(listener);
  return () => {
    resyncListeners.delete(listener);
  };
}

export function requestBillReminderResync(): void {
  for (const listener of [...resyncListeners]) listener();
}

/**
 * Ask for notification permission at a natural moment (after the first bill
 * is saved). Already granted: true, no prompt. Refused before: false, no
 * prompt (the person said no; the bills screen still shows what is due). Never
 * asked: the system prompt once. A grant re-plans the reminders right away.
 */
export async function ensurePermission(notifier: BillAlertNotifier): Promise<boolean> {
  try {
    const current = await notifier.permission();
    if (current === "granted") return true;
    if (current === "denied") return false;
    const answer = await notifier.requestPermission();
    if (answer !== "granted") return false;
    requestBillReminderResync();
    return true;
  } catch {
    return false;
  }
}
