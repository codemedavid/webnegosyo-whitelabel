// Kitchen auto-print decisions. A device with a kitchen-role printer and the
// toggle on prints the chit the moment a NEW ticket lands on the board.
// "New" comes from scanNewTickets (lib/kitchen-tickets), which already
// excludes the first answered snapshot — tickets that were on the board when
// the device opened did not just arrive. The persisted printed-list closes the
// remaining gap: remounting the watcher resets its in-memory seen-set, which
// would re-report live tickets as new and double-print them.

export const PRINTED_LIST_CAP = 500;

export interface AutoPrintDecisionInput {
  /** Tickets scanNewTickets reported as genuinely new this tick. */
  newIds: readonly string[];
  /** Order ids this device already auto-printed (persisted, FIFO-capped). */
  printedList: readonly string[];
  /** The merchant's per-device kitchen auto-print toggle. */
  enabled: boolean;
  hasKitchenPrinter: boolean;
  /** The read-only demo must never move paper on a real printer. */
  isDemo: boolean;
}

export function selectTicketsToAutoPrint(input: AutoPrintDecisionInput): string[] {
  if (!input.enabled || !input.hasKitchenPrinter || input.isDemo) return [];
  const printed = new Set(input.printedList);
  return input.newIds.filter((id) => !printed.has(id));
}

/** Append newly printed ids, dedup, and drop the oldest past the cap. */
export function recordPrinted(
  printedList: readonly string[],
  ids: readonly string[],
): string[] {
  const existing = new Set(printedList);
  const appended = [...printedList, ...ids.filter((id) => !existing.has(id))];
  return appended.slice(Math.max(0, appended.length - PRINTED_LIST_CAP));
}

/** Corrupt or absent storage reads as an empty history — never a crash. */
export function parsePrintedList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function serializePrintedList(list: readonly string[]): string {
  return JSON.stringify(list);
}
