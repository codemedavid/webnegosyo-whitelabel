/**
 * The two hooks the tutorial screens share: which chapters this account is
 * offered, and this account's progress (loaded once per session).
 *
 * The progress record is scoped to the signed-in user, and every demo session
 * shares one — a guest exploring the demo store twice should not be greeted
 * twice, and no demo session has a user id to key on.
 */

import { useEffect, useMemo } from "react";

import { TUTORIAL_CHAPTERS, type TutorialChapter } from "./chapters";
import { visibleChapters } from "./visibility";
import { usePortfolioAudience } from "../use-portfolio-audience";
import { useAdvanceOrdering } from "../use-advance-ordering";
import { useDineIn } from "../use-dine-in";
import { useAuthStore } from "../../stores/auth-store";
import { useTutorialStore } from "../../stores/tutorial-store";

export const DEMO_TUTORIAL_SCOPE = "demo";

export function useTutorialChapters(): TutorialChapter[] {
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const isDemo = useAuthStore((s) => s.isDemo);
  const audience = usePortfolioAudience();
  const takesAdvanceOrders = useAdvanceOrdering();
  const takesDineIn = useDineIn();

  return useMemo(
    () =>
      visibleChapters(
        TUTORIAL_CHAPTERS,
        { caller: { role, isOwner, permissions }, audience, takesAdvanceOrders, takesDineIn },
        { isOwner, isDemo },
      ),
    [role, isOwner, permissions, audience, takesAdvanceOrders, takesDineIn, isDemo],
  );
}

/** Loads the session's progress record; safe to mount from several screens. */
export function useTutorialProgress() {
  const userId = useAuthStore((s) => s.userId);
  const isDemo = useAuthStore((s) => s.isDemo);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const scope = isDemo ? DEMO_TUTORIAL_SCOPE : userId;
  const loadedScope = useTutorialStore((s) => s.scope);
  const load = useTutorialStore((s) => s.load);

  useEffect(() => {
    if (!isAuthenticated || !scope || loadedScope === scope) return;
    void load(scope);
  }, [isAuthenticated, scope, loadedScope, load]);

  const progress = useTutorialStore((s) => s.progress);
  const isLoaded = useTutorialStore((s) => s.isLoaded && s.scope === scope);
  return { progress, isLoaded };
}
