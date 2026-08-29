/**
 * Where a session opens, once the owner is allowed to say.
 *
 * The app has always opened on the order queue, and lately on the portfolio
 * for someone running several branches. Both are guesses at the same question
 * — what does this person come here to do? — and an owner who has answered it
 * for a specific account outranks either guess.
 *
 * Everything else in this module exists to make that answer safe to store. The
 * choice is written on the web, saved as free text, and read months later by a
 * different build: by then the screen may have been renamed, the permission
 * behind it revoked, or the store dropped back to one branch. None of those
 * may cost the merchant the app. Every unusable choice falls back to exactly
 * what the account would have got had nothing been chosen — never to a blank
 * tab bar, and never to "operations always", which would itself be a
 * regression for the multi-branch owner who never configured anything.
 */

import { MERCHANT_LANDING_HREF } from "./session-resolve";
import {
  isPortfolioAvailable,
  landingWorkspace,
  type PortfolioAudience,
} from "./portfolio-landing";
import { isTabAllowed, type StaffPermissionHolder } from "./staff-permissions";
import { defaultTabHref, workspaceForTab, type WorkspaceKey } from "./workspaces";

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
  /** The view to make active, so the tab bar shows the right tabs. */
  workspace: WorkspaceKey;
  /**
   * Where to navigate, or null to stay put. Null is not "nowhere in
   * particular": it means the app already opens here, and redirecting onto the
   * screen you are standing on costs a frame and remounts the tab navigator.
   */
  href: string | null;
}

/** What the account would land on with nothing configured. */
function automaticLanding(audience: PortfolioAudience): Landing {
  const workspace = landingWorkspace(audience);
  return workspace === "operations"
    ? { workspace, href: null }
    : { workspace, href: defaultTabHref(workspace) };
}

export function resolveLanding(request: LandingRequest): Landing {
  const fallback = automaticLanding(request.audience);

  // The demo is a scripted look at a working store, and carries no staff row
  // to have been configured. Guarding here keeps a stale value from steering
  // the tour if one ever does arrive.
  if (request.isDemo ?? request.audience.isDemo) return fallback;

  const tab = typeof request.defaultTab === "string" ? request.defaultTab.trim() : "";
  if (tab === "") return fallback;

  // A screen that no longer exists, or never did. The column is free text.
  const workspace = workspaceForTab(tab);
  if (workspace === undefined) return fallback;

  // The grant behind the screen can be revoked long after it was chosen.
  if (!isTabAllowed(request.user, tab)) return fallback;

  // Business screens compare branches, so they need a store-wide account with
  // branches to compare — which the choice cannot know and can outlive.
  if (workspace === "business" && !isPortfolioAvailable(request.audience)) return fallback;

  const href = `/(main)/${tab}`;
  return { workspace, href: href === MERCHANT_LANDING_HREF ? null : href };
}
