import { useEffect, useRef } from "react";
import { router } from "expo-router";

import { landingWorkspace } from "./portfolio-landing";
import { useAccountBranchScope } from "./use-branch-scope";
import { useOutlets } from "./use-outlets";
import { useAuthStore } from "../stores/auth-store";
import { useWorkspaceStore } from "../stores/workspace-store";
import { goTo, type TabAwareRouter } from "./tab-navigation";

/**
 * Opens a multi-branch owner on their portfolio instead of the order queue,
 * and loads the branch list every other branch rule depends on.
 *
 * Mounted once in `app/(main)/_layout.tsx`, for two reasons that happen to
 * coincide: the branch count needed to decide the landing view is the same
 * query that publishes known branch ids to the context store, which is what
 * lets a stale or foreign selection be rejected app-wide.
 *
 * It redirects at most once per session, and only while the merchant is still
 * on the tab they were dropped on. Anything else would mean yanking someone
 * out of a screen they deliberately opened, seconds after they opened it,
 * because a background query finally came back.
 */
export function useBranchLanding(): void {
  const accountScope = useAccountBranchScope();
  const isDemo = useAuthStore((s) => s.isDemo);
  const { outlets, isLoading } = useOutlets();

  const workspace = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current || isLoading) return;

    // Still on the default view means the merchant has not navigated yet. Once
    // they have, where they are is their choice, not ours to override.
    if (workspace !== "operations") {
      hasRedirected.current = true;
      return;
    }

    const target = landingWorkspace({
      accountScope,
      activeOutletCount: outlets.length,
      isDemo,
    });

    hasRedirected.current = true;
    if (target === "operations") return;

    setWorkspace(target);
    // navigate, not replace — replacing into a sibling tab remounts the tab
    // navigator mid-switch and crashes. See lib/tab-navigation.ts.
    goTo(router as TabAwareRouter<`/(main)/${string}`>, "/(main)/portfolio");
  }, [accountScope, isDemo, isLoading, outlets.length, workspace, setWorkspace]);
}
