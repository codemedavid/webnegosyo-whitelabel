/**
 * Tutorial progress arithmetic.
 *
 * Pure so the hub's promises are testable without a renderer: the ring's
 * fraction, which chapter "Continue" resumes, and whether the first-run
 * greeter still owes the merchant a hello. Storage lives in
 * stores/tutorial-store.ts; this module never touches it.
 */

export interface TutorialProgress {
  /** Chapters finished on this account, in the order they were finished. */
  completedChapterIds: readonly string[];
  /** The chapter most recently opened or finished; where "Continue" leans. */
  lastChapterId: string | null;
  /** The first-run greeter was shown (started or dismissed). */
  welcomeSeen: boolean;
}

export const EMPTY_PROGRESS: TutorialProgress = {
  completedChapterIds: [],
  lastChapterId: null,
  welcomeSeen: false,
};

export interface ProgressSummary {
  completed: number;
  total: number;
  /** 0..1 of the chapters this account can see. */
  fraction: number;
  isComplete: boolean;
}

/** Progress against the chapters this account can currently see. */
export function progressSummary(
  progress: TutorialProgress,
  visibleChapterIds: readonly string[],
): ProgressSummary {
  const done = new Set(progress.completedChapterIds);
  const completed = visibleChapterIds.filter((id) => done.has(id)).length;
  const total = visibleChapterIds.length;
  return {
    completed,
    total,
    fraction: total === 0 ? 0 : completed / total,
    isComplete: total > 0 && completed === total,
  };
}

export function markChapterComplete(progress: TutorialProgress, chapterId: string): TutorialProgress {
  const completedChapterIds = progress.completedChapterIds.includes(chapterId)
    ? progress.completedChapterIds
    : [...progress.completedChapterIds, chapterId];
  return { ...progress, completedChapterIds, lastChapterId: chapterId };
}

export function markChapterOpened(progress: TutorialProgress, chapterId: string): TutorialProgress {
  return { ...progress, lastChapterId: chapterId };
}

export function markWelcomeSeen(progress: TutorialProgress): TutorialProgress {
  return { ...progress, welcomeSeen: true };
}

/** Forgets every chapter so the tour can be taken again; the greeter stays quiet. */
export function resetProgress(progress: TutorialProgress): TutorialProgress {
  return { ...EMPTY_PROGRESS, welcomeSeen: progress.welcomeSeen };
}

/**
 * The chapter "Continue" should open: the first unfinished one after the last
 * chapter touched, wrapping around to earlier unfinished ones; null when the
 * whole tour is done.
 */
export function nextChapter(
  progress: TutorialProgress,
  visibleChapterIds: readonly string[],
): string | null {
  const done = new Set(progress.completedChapterIds);
  const lastIndex = progress.lastChapterId ? visibleChapterIds.indexOf(progress.lastChapterId) : -1;
  const ordered = [
    ...visibleChapterIds.slice(lastIndex + 1),
    ...visibleChapterIds.slice(0, lastIndex + 1),
  ];
  return ordered.find((id) => !done.has(id)) ?? null;
}

export interface WelcomeEligibility {
  isAuthenticated: boolean;
  isSuperadmin: boolean;
  impersonatedTenantId: string | null;
  progress: TutorialProgress;
}

/**
 * The greeter shows once per account, to merchants only. A superadmin viewing
 * a store already knows the app; greeting them would also stamp "seen" onto
 * whichever store they happened to open.
 */
export function shouldShowTutorialWelcome(input: WelcomeEligibility): boolean {
  if (!input.isAuthenticated) return false;
  if (input.isSuperadmin || input.impersonatedTenantId) return false;
  if (input.progress.welcomeSeen) return false;
  return input.progress.completedChapterIds.length === 0;
}
