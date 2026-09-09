/**
 * Which chapters an account is offered.
 *
 * A chapter teaches a screen, so it is shown exactly when that screen is
 * reachable for this account — the same four gates the tab bar and the Menu
 * hub apply (lib/tab-visibility.ts). Owner-only chapters (Team) additionally
 * need the account to be the owner; the demo store gets the full owner tour
 * because a demo is a showcase, not a permission set.
 */

import { isTabReachable, type TabVisibilityContext } from "../tab-visibility";
import type { TutorialChapter } from "./chapters";

export interface ChapterViewer {
  isOwner: boolean;
  isDemo: boolean;
}

export function isChapterVisible(
  chapter: TutorialChapter,
  ctx: TabVisibilityContext,
  viewer: ChapterViewer,
): boolean {
  if (chapter.ownersOnly && !viewer.isOwner && !viewer.isDemo) return false;
  if (chapter.gateTab === null) return true;
  return isTabReachable(chapter.gateTab, ctx);
}

export function visibleChapters(
  chapters: readonly TutorialChapter[],
  ctx: TabVisibilityContext,
  viewer: ChapterViewer,
): TutorialChapter[] {
  return chapters.filter((chapter) => isChapterVisible(chapter, ctx, viewer));
}
