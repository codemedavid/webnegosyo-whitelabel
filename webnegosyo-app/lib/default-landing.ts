/**
 * Where a session opens, once the owner is allowed to say.
 *
 * The app opens on Home — today's money, the live queue, and the doors to
 * everything else — and an owner who has answered "what does this person come
 * here to do?" for a specific account outranks that default.
 *
 * Everything else in this module exists to make that answer safe to store. The
 * choice is written on the web, saved as free text, and read months later by a
 * different build: by then the screen may have been renamed, the permission
 * behind it revoked, or the store dropped back to one branch. None of those
 * may cost the merchant the app. Every unusable choice falls back to exactly
 * what the account would have got had nothing been chosen — never to a screen
 * the account cannot open.
 */

import { MERCHANT_LANDING_HREF } from "./session-resolve";
import { isPortfolioAvailable, type PortfolioAudience } from "./portfolio-landing";
import { isTabAllowed, type StaffPermissionHolder } from "./staff-permissions";
import { workspaceForTab } from "./workspaces";

export interface LandingRequest {
  /** The screen this account is pinned to; null/blank means no choice. */
  defaultTab: string | null | undefined;
  user: StaffPermissionHolder;
  audience: PortfolioAudience;
  /**
   * Demo tour. Read from the audience when omitted — the two always agree in
   * practice, and taking either lets a caller pass the one it already holds.
   */
  isDemo?: boolean | null;
}

export interface Landing {
  /**
   * Where to navigate, or null to stay put. Null is not "nowhere in
   * particular": it means the app already opens here (Home), and redirecting
   * onto the screen you are standing on costs a frame and remounts the tab
   * navigator.
   */
  href: string | null;
}

/** What every account gets with nothing configured: Home. */
const HOME: Landing = { href: null };

export function resolveLanding(request: LandingRequest): Landing {
  // The demo is a scripted look at a working store, and carries no staff row
  // to have been configured. Guarding here keeps a stale value from steering
  // the tour if one ever does arrive.
  if (request.isDemo ?? request.audience.isDemo) return HOME;

  const tab = typeof request.defaultTab === "string" ? request.defaultTab.trim() : "";
  if (tab === "") return HOME;

  // A screen that no longer exists, or never did. The column is free text.
  const workspace = workspaceForTab(tab);
  if (workspace === undefined) return HOME;

  // The grant behind the screen can be revoked long after it was chosen.
  if (!isTabAllowed(request.user, tab)) return HOME;

  // Business screens compare branches, so they need a store-wide account with
  // branches to compare — which the choice cannot know and can outlive.
  if (workspace === "business" && !isPortfolioAvailable(request.audience)) return HOME;

  const href = `/(main)/${tab}`;
  return { href: href === MERCHANT_LANDING_HREF ? null : href };
}
