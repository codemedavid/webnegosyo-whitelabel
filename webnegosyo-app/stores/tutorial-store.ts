/**
 * Per-account tutorial progress, kept on the device.
 *
 * Device-local rather than a tenant column on purpose: which chapters a person
 * has watched is about the person holding the phone, and a store shared by an
 * owner and two cashiers should let each of them learn at their own pace. No
 * PII and no secrets, so AsyncStorage is appropriate — the same reasoning as
 * the printer and register settings.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  EMPTY_PROGRESS,
  markChapterComplete,
  markChapterOpened,
  markWelcomeSeen,
  resetProgress,
  type TutorialProgress,
} from "../lib/tutorial/progress";

const STORAGE_PREFIX = "tutorial_progress:";

/** One record per signed-in user; every demo session shares one. */
export function tutorialStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

function parseProgress(raw: string | null): TutorialProgress {
  if (!raw) return EMPTY_PROGRESS;
  try {
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>;
    return {
      completedChapterIds: Array.isArray(parsed.completedChapterIds)
        ? parsed.completedChapterIds.filter((id): id is string => typeof id === "string")
        : [],
      lastChapterId: typeof parsed.lastChapterId === "string" ? parsed.lastChapterId : null,
      welcomeSeen: parsed.welcomeSeen === true,
    };
  } catch {
    // A corrupt record starts the tour over rather than crashing the greeter.
    return EMPTY_PROGRESS;
  }
}

interface TutorialState {
  /** Account the loaded progress belongs to; null before `load`. */
  scope: string | null;
  progress: TutorialProgress;
  isLoaded: boolean;
  load: (scope: string) => Promise<void>;
  openChapter: (chapterId: string) => Promise<void>;
  completeChapter: (chapterId: string) => Promise<void>;
  dismissWelcome: () => Promise<void>;
  reset: () => Promise<void>;
}

export const useTutorialStore = create<TutorialState>((set, get) => {
  // Set first, persist second: a failed write must never snap a finished
  // chapter back to unfinished in front of the merchant.
  const commit = async (progress: TutorialProgress) => {
    set({ progress });
    const { scope } = get();
    if (!scope) return;
    try {
      await AsyncStorage.setItem(tutorialStorageKey(scope), JSON.stringify(progress));
    } catch (err) {
      console.warn("[Tutorial] Failed to persist progress:", err);
    }
  };

  return {
    scope: null,
    progress: EMPTY_PROGRESS,
    isLoaded: false,

    load: async (scope) => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(tutorialStorageKey(scope));
      } catch {
        // Unreadable storage behaves like a first run.
      }
      set({ scope, progress: parseProgress(raw), isLoaded: true });
    },

    openChapter: (chapterId) => commit(markChapterOpened(get().progress, chapterId)),
    completeChapter: (chapterId) => commit(markChapterComplete(get().progress, chapterId)),
    dismissWelcome: () => commit(markWelcomeSeen(get().progress)),
    reset: () => commit(resetProgress(get().progress)),
  };
});
