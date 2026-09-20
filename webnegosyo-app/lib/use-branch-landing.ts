import { useEffect, useRef } from "react";
import { router, usePathname } from "expo-router";

import { resolveLanding } from "./default-landing";
import { useAccountBranchScope } from "./use-branch-scope";
import { useOutlets } from "./use-outlets";
import { useAuthStore } from "../stores/auth-store";
import { goTo, type TabAwareRouter } from "./tab-navigation";

/** The screen the tab navigator opens on; the only place a redirect may start from. */
const HOME_PATHNAME = "/dashboard";

/**
 * Opens an account on the screen its owner pinned it to, and loads the branch
 * list every other branch rule depends on.
 *
 * Mounted once in `app/(main)/_layout.tsx`, for two reasons that happen to
 * coincide: the branch count needed to validate a pinned Business screen is
 * the same query that publishes known branch ids to the context store, which
 * is what lets a stale or foreign selection be rejected app-wide.
 *
 * It redirects at most once per session, and only while the merchant is still
 * on Home. Anything else would mean yanking someone out of a screen they
 * deliberately opened, seconds after they opened it, because a background
 * query finally came back.
 */
export function useBranchLanding(): void {
  const accountScope = useAccountBranchScope();
  const isDemo = useAuthStore((s) => s.isDemo);
  const defaultTab = useAuthStore((s) => s.defaultTab);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const { outlets, isLoading } = useOutlets();
  const pathname = usePathname();

  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current || isLoading) return;

    // Still on Home means the merchant has not navigated yet. Once they have,
    // where they are is their choice, not ours to override.
    if (pathname !== HOME_PATHNAME) {
      hasRedirected.current = true;
      return;
    }

    const target = resolveLanding({
      defaultTab,
      user: { role, isOwner, permissions },
      audience: {
        accountScope,
        activeOutletCount: outlets.length,
        isDemo,
      },
      isDemo,
    });

    hasRedirected.current = true;
    if (target.href === null) return;

    // navigate, not replace — replacing into a sibling tab remounts the tab
    // navigator mid-switch and crashes. See lib/tab-navigation.ts.
    goTo(router as TabAwareRouter<`/(main)/${string}`>, target.href as `/(main)/${string}`);
  }, [
    accountScope,
    defaultTab,
    isDemo,
    isLoading,
    isOwner,
    outlets.length,
    pathname,
    permissions,
    role,
  ]);
}
