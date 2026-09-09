// The device's memory of what it has already auto-printed, shared between
// every surface that can move paper.
//
// Each auto-print watcher used to keep its own copy of this list in component
// state, hydrated from AsyncStorage on mount. That worked while the watcher
// was the ONLY thing printing — but the register now prints the kitchen chit
// for a counter sale the instant the sale is written, long before the
// watcher's subscription reports the order. Two private copies of the list
// would print that chit twice. One module-level ledger per kind, with
// `claimPrinted` as the single gate, is what makes "print it now, and never
// again" hold across surfaces.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { parsePrintedList, recordPrinted, serializePrintedList } from "./kitchen-autoprint";

/** The two kinds of paper this device auto-prints, each with its own history. */
export type PrintedLedgerKind = "kitchen" | "receipt";

const STORAGE_KEYS: Record<PrintedLedgerKind, string> = {
  kitchen: "kitchen_printed_orders",
  receipt: "receipt_printed_orders",
};

interface Ledger {
  /** null until storage has answered — never claim against an unknown history. */
  list: readonly string[] | null;
  hydration: Promise<readonly string[]> | null;
  listeners: Set<() => void>;
}

const ledgers: Record<PrintedLedgerKind, Ledger> = {
  kitchen: { list: null, hydration: null, listeners: new Set() },
  receipt: { list: null, hydration: null, listeners: new Set() },
};

function notify(ledger: Ledger): void {
  for (const listener of ledger.listeners) listener();
}

/**
 * Read the persisted history once. Concurrent callers share the read; a
 * corrupt or missing entry hydrates as an empty history, never a crash.
 */
export function hydratePrintedLedger(kind: PrintedLedgerKind): Promise<readonly string[]> {
  const ledger = ledgers[kind];
  if (ledger.list !== null) return Promise.resolve(ledger.list);
  if (ledger.hydration) return ledger.hydration;

  ledger.hydration = AsyncStorage.getItem(STORAGE_KEYS[kind])
    .then((raw) => parsePrintedList(raw))
    .catch((): string[] => [])
    .then((parsed) => {
      // A claim made while the read was in flight already wrote the list;
      // storage must not overwrite it with the stale pre-claim snapshot.
      if (ledger.list === null) {
        ledger.list = parsed;
        notify(ledger);
      }
      return ledger.list ?? parsed;
    });
  return ledger.hydration;
}

/** The current history, or null while storage is still being read. */
export function getPrintedLedger(kind: PrintedLedgerKind): readonly string[] | null {
  return ledgers[kind].list;
}

/**
 * Take ownership of printing `ids`. Returns the ids NOT already in the
 * history and records them — before any paper moves, so a jam is a manual
 * reprint and a crash loop is never a reprint loop. Waits for hydration so a
 * claim made in the first second after launch cannot double-print an order
 * a previous session already handled.
 */
export async function claimPrinted(
  kind: PrintedLedgerKind,
  ids: readonly string[],
): Promise<string[]> {
  const ledger = ledgers[kind];
  await hydratePrintedLedger(kind);
  // Re-read AFTER the await: a claim that resumed a tick earlier has already
  // written the list, and this one must see it.
  const current = ledger.list ?? [];
  const known = new Set(current);
  const fresh = ids.filter((id) => !known.has(id));
  if (fresh.length === 0) return [];

  ledger.list = recordPrinted(current, fresh);
  notify(ledger);
  AsyncStorage.setItem(STORAGE_KEYS[kind], serializePrintedList(ledger.list)).catch(() => {
    // A failed persist only risks one duplicate after a relaunch.
  });
  return fresh;
}

/**
 * Subscribe a component to the history. Kicks off hydration on first use, so
 * a watcher mounting is enough to load the list.
 */
export function usePrintedLedger(kind: PrintedLedgerKind): readonly string[] | null {
  const ledger = ledgers[kind];
  return useSyncExternalStore(
    (listener) => {
      ledger.listeners.add(listener);
      void hydratePrintedLedger(kind);
      return () => {
        ledger.listeners.delete(listener);
      };
    },
    () => ledger.list,
    () => ledger.list,
  );
}

/** Test seam: forget everything, including any in-flight hydration. */
export function resetPrintedLedgers(): void {
  for (const ledger of Object.values(ledgers)) {
    ledger.list = null;
    ledger.hydration = null;
    ledger.listeners.clear();
  }
}
