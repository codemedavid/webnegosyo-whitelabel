/**
 * The owl bubble's memory: how often this device opened Owl and whether the
 * owner hid the tips (saved), plus which screens already showed a tip this
 * app session (in memory, so a fresh launch introduces Owl again until the
 * intro is done).
 */

import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "assistant.owlHints";

interface SavedHintState {
  opens: number;
  isDismissed: boolean;
}

const EMPTY: SavedHintState = { opens: 0, isDismissed: false };

/** Screens whose tip showed since the app launched. */
const sessionSeenScreens = new Set<string>();

function parseSaved(raw: string | null): SavedHintState {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<SavedHintState>;
    return {
      opens: typeof value.opens === "number" && Number.isFinite(value.opens) ? value.opens : 0,
      isDismissed: value.isDismissed === true,
    };
  } catch {
    return EMPTY;
  }
}

function save(state: SavedHintState): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
    // Not saved: the tips simply keep showing a little longer. Nothing to tell the owner.
  });
}

export function useOwlHintState() {
  const [saved, setSaved] = useState<SavedHintState>(EMPTY);
  const [isLoaded, setIsLoaded] = useState(false);
  const [seenScreens, setSeenScreens] = useState<ReadonlySet<string>>(() => new Set(sessionSeenScreens));

  useEffect(() => {
    let isActive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (isActive) setSaved(parseSaved(raw));
      })
      .catch(() => {
        // Unreadable storage reads as a new owner; the tips are harmless.
      })
      .finally(() => {
        if (isActive) setIsLoaded(true);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const update = useCallback((change: (current: SavedHintState) => SavedHintState) => {
    setSaved((current) => {
      const next = change(current);
      save(next);
      return next;
    });
  }, []);

  const recordOpen = useCallback(() => update((current) => ({ ...current, opens: current.opens + 1 })), [update]);
  const dismiss = useCallback(() => update((current) => ({ ...current, isDismissed: true })), [update]);

  const markSeen = useCallback((screenKey: string) => {
    sessionSeenScreens.add(screenKey);
    setSeenScreens(new Set(sessionSeenScreens));
  }, []);

  return { ...saved, isLoaded, seenScreens, recordOpen, dismiss, markSeen };
}
