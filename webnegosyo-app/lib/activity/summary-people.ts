/**
 * Summary → "By person" (design spec §3.4.6, §5 fairness).
 *
 * Each person is compared only with THEIR OWN normal — never with each other,
 * never ranked. The rate is per shift worked, so the busiest cashier is not
 * punished for being busy (the summary RPC rolls routine kinds up without an
 * actor, so orders handled per person is not available; shifts are).
 * Sorted: people with something to check first, then A–Z. No numbers rank.
 */

import type { StoreActivityActorTotal, StoreActivitySummary } from "./store-event";
import type { ActivityKind } from "./taxonomy";

/** Shifts of history before "usually" is shown (spec: at least 10). */
export const MIN_SHIFTS_FOR_NORMAL = 10;
/** A person is "Check" only at this many events in the period at least … */
const MIN_COUNT_TO_CHECK = 2;
/** … and more than this multiple of what their own normal predicts. */
const CHECK_MULTIPLE = 2;

/** What a person's line counts: money or stock that left on their say-so. */
const WATCHED_KINDS: readonly { kind: ActivityKind; one: string; many: string }[] = [
  { kind: "order.cancelled", one: "cancel", many: "cancels" },
  { kind: "refund.issued", one: "refund", many: "refunds" },
  { kind: "stock.wasted", one: "write-off", many: "write-offs" },
];

export type PersonStatus = "check" | "normal" | "new";

export interface PersonRow {
  actorUserId: string;
  name: string;
  line: string;
  status: PersonStatus;
}

interface PersonTotals {
  name: string;
  counts: ReadonlyMap<ActivityKind, number>;
}

function groupByActor(totals: readonly StoreActivityActorTotal[]): Map<string, PersonTotals> {
  const people = new Map<string, PersonTotals>();
  for (const total of totals) {
    if (!total.actorUserId) continue;
    const previous = people.get(total.actorUserId);
    const counts = new Map(previous?.counts ?? []);
    counts.set(total.kind, (counts.get(total.kind) ?? 0) + total.count);
    people.set(total.actorUserId, { name: previous?.name ?? total.actorName ?? "Staff", counts });
  }
  return people;
}

function countOf(person: PersonTotals | undefined, kind: ActivityKind): number {
  return person?.counts.get(kind) ?? 0;
}

function usualWords(expected: number): string {
  if (expected < 1) return "usually 0–1";
  return `usually about ${Math.round(expected)}`;
}

function rowFor(id: string, now: PersonTotals, before: PersonTotals | undefined): PersonRow {
  const watched = WATCHED_KINDS.map((watch) => ({ ...watch, count: countOf(now, watch.kind) })).filter((watch) => watch.count > 0);
  if (watched.length === 0) return { actorUserId: id, name: now.name, line: "Nothing to check", status: "normal" };
  // The line names the kind there is most of; its own normal decides the chip.
  const main = [...watched].sort((a, b) => b.count - a.count)[0];
  const what = `${main.count} ${main.count === 1 ? main.one : main.many}`;
  const baseShifts = countOf(before, "shift.opened");
  if (baseShifts < MIN_SHIFTS_FOR_NORMAL) return { actorUserId: id, name: now.name, line: `${what} · New: no normal yet`, status: "new" };
  const perShift = countOf(before, main.kind) / baseShifts;
  const expected = perShift * Math.max(countOf(now, "shift.opened"), 1);
  const isOff = main.count >= MIN_COUNT_TO_CHECK && main.count > Math.max(expected, 1) * CHECK_MULTIPLE;
  return { actorUserId: id, name: now.name, line: `${what} · ${usualWords(expected)}`, status: isOff ? "check" : "normal" };
}

export function buildPeopleRows(current: StoreActivitySummary, baseline: StoreActivitySummary | null): PersonRow[] {
  const now = groupByActor(current.byActor);
  const before = groupByActor(baseline?.byActor ?? []);
  const rows = [...now.entries()].map(([id, totals]) => rowFor(id, totals, before.get(id)));
  return rows.sort((a, b) => {
    const aCheck = a.status === "check" ? 0 : 1;
    const bCheck = b.status === "check" ? 0 : 1;
    return aCheck - bCheck || a.name.localeCompare(b.name);
  });
}
