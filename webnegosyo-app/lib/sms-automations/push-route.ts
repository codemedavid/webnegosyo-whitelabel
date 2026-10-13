/**
 * Where a tapped texting notification opens. Pure.
 *
 *   - "Your automated texts are waiting" (server push, kind `sms_texts_waiting`)
 *     → Texts, whose top strip says what the sending phone needs.
 *   - A campaign's "time to send" reminder (local notification carrying
 *     `campaignId`) → that campaign.
 *
 * Mirrors the push kind in src/lib/sms-automations/server/waiting-alert.ts.
 */

import { campaignHref, textsHref } from "../navigation";

export const TEXTS_WAITING_PUSH_KIND = "sms_texts_waiting";

export function textingRouteFromPushData(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { kind, campaignId } = data as { kind?: unknown; campaignId?: unknown };
  if (kind === TEXTS_WAITING_PUSH_KIND) return textsHref();
  if (typeof campaignId === "string" && campaignId !== "") return campaignHref(campaignId);
  return null;
}
