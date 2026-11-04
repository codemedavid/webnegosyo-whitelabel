/**
 * "Saved · LPG ₱1,050 · Undo" for every screen.
 *
 * A saved expense waits on the phone for `UNDO_WINDOW_MS` before it is sent,
 * so Undo never has to void anything. The window used to live inside the
 * Add-expense sheet and died with it; it lives here now, and
 * `components/expenses/ExpenseUndoHost.tsx` (mounted once in the (main)
 * layout) draws the bar, so it survives "Save" closing the sheet.
 *
 * The store owns the timer, not the bar: an entry is sent when its window
 * closes even if no bar is on screen. Each entry is sent OR undone exactly
 * once, however many bars show it or taps race. A second save inside the
 * window sends the first one now and shows the newest.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

/** How long "Saved · … · Undo" stays, and how long the entry waits unsent (plan §5.1). */
export const UNDO_WINDOW_MS = 6_000;

/**
 * How many sent-or-undone ids the store remembers, newest kept. Ids are
 * client request ids, unique per save, so only a late repeat of a recent one
 * needs refusing; older ones are forgotten so a long day never grows the set.
 */
export const SETTLED_MEMORY = 50;

export type UndoResult = { status: "undone" } | { status: "error"; message: string };

/** A second button beside Undo ("Repeat" → make it a monthly bill); it never sends or undoes anything. */
export interface UndoEntryOffer {
  label: string;
  /** The bar's words while the offer stands ("Saved · Rent ₱15,000 · Pay this every month?"). */
  message: string;
  /** Where the button goes. */
  href: string;
}

export interface UndoEntry {
  /** The expense's client request id. */
  id: string;
  message: string;
  offer?: UndoEntryOffer | null;
  /** Sends it now (its window closed). */
  commit: () => Promise<void>;
  /** Takes it back. */
  undo: () => Promise<UndoResult>;
}

export interface ExpenseUndoState {
  /** The newest entry still in its window; the bar shows this one. */
  current: UndoEntry | null;
  show: (entry: UndoEntry) => void;
  /** Sends an entry now. Does nothing if it was already sent or undone. */
  commit: (id: string) => void;
  /** Null when it had already been sent or undone (nothing happened). */
  undo: (id: string) => Promise<UndoResult | null>;
}

const UNDO_FAILED: UndoResult = { status: "error", message: "Could not undo it. Try again." };

export function createExpenseUndoStore(windowMs: number = UNDO_WINDOW_MS): StoreApi<ExpenseUndoState> {
  const waiting = new Map<string, { entry: UndoEntry; timer: ReturnType<typeof setTimeout> }>();
  const settled = new Set<string>();

  return createStore<ExpenseUndoState>((set, get) => {
    /** Takes an entry out of its window exactly once; null if someone already did. */
    const settle = (id: string): UndoEntry | null => {
      const held = waiting.get(id);
      if (!held || settled.has(id)) return null;
      settled.add(id);
      // A Set iterates oldest first: drop the oldest once past the cap.
      if (settled.size > SETTLED_MEMORY) {
        const oldest = settled.values().next().value;
        if (oldest !== undefined) settled.delete(oldest);
      }
      waiting.delete(id);
      clearTimeout(held.timer);
      if (get().current?.id === id) set({ current: null });
      return held.entry;
    };

    const commit = (id: string): void => {
      const entry = settle(id);
      // The queue keeps it and ExpenseSync retries; a failed send is not lost.
      if (entry) void entry.commit().catch(() => undefined);
    };

    return {
      current: null,
      show: (entry) => {
        if (settled.has(entry.id) || waiting.has(entry.id)) return;
        const previous = get().current;
        waiting.set(entry.id, { entry, timer: setTimeout(() => commit(entry.id), windowMs) });
        set({ current: entry });
        if (previous) commit(previous.id);
      },
      commit,
      undo: async (id) => {
        const entry = settle(id);
        if (!entry) return null;
        try {
          return await entry.undo();
        } catch {
          return UNDO_FAILED;
        }
      },
    };
  });
}

export const expenseUndoStore = createExpenseUndoStore();

export function useExpenseUndo<T>(select: (state: ExpenseUndoState) => T): T {
  return useStore(expenseUndoStore, select);
}
