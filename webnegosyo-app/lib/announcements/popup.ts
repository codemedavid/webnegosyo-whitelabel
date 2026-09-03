// Which "What's New" post greets a merchant on open, whether this session is
// greeted at all, and where a tapped announcement push lands. Pure rules; the
// popup host (components/WhatsNewPopup.tsx) and the root layout's tap handler
// are thin shells around them.

import type { AnnouncementKind } from "./blocks";

/** The slice of a published announcement the popup rule looks at. */
export interface PopupCandidate {
  id: string;
  kind: AnnouncementKind;
  showPopup: boolean;
  /** ISO instant. */
  publishedAt: string;
}

/**
 * The newest unread post that asked for a popup, or null. Notices never pop
 * up — they arrive as pushes and sit in the inbox — and a post the author
 * marked quiet is only ever found on the list.
 */
export function pickPopupAnnouncement<T extends PopupCandidate>(
  candidates: readonly T[],
  readIds: ReadonlySet<string>
): T | null {
  const eligible = candidates.filter(
    (c) => c.kind === "post" && c.showPopup && !readIds.has(c.id)
  );
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
}

/** The slice of auth state that decides whether platform news is shown. */
export interface WhatsNewSessionState {
  isAuthenticated: boolean;
  userId: string | null;
  isDemo: boolean;
  isSuperadmin: boolean;
  impersonatedTenantId: string | null;
}

/**
 * Only a real signed-in account is greeted. The demo must stay a quiet
 * showroom (App Review walks through it), and a superadmin borrowing a
 * merchant view is a spectator — their reads would be filed under their own
 * account, not the merchant's, so the merchant would still be greeted later.
 */
export function shouldShowWhatsNew(state: WhatsNewSessionState): boolean {
  if (!state.isAuthenticated || !state.userId) return false;
  if (state.isDemo) return false;
  if (state.isSuperadmin && state.impersonatedTenantId !== null) return false;
  return true;
}

export const WHATS_NEW_LIST_ROUTE = "/(main)/whats-new" as const;

/** The screen a tapped announcement push opens, or null when it is not one. */
export function announcementRouteFromPushData(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { announcementId, kind } = data as { announcementId?: unknown; kind?: unknown };
  if (typeof announcementId !== "string" || announcementId === "") return null;
  if (kind === "notice") return WHATS_NEW_LIST_ROUTE;
  return `${WHATS_NEW_LIST_ROUTE}/${announcementId}`;
}
