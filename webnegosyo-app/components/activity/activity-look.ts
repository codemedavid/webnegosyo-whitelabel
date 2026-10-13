/**
 * How an activity row looks: its glyph, its tile tint, its amount ink.
 *
 * Red is reserved for money leaving the store, and even then the minus sign
 * carries the meaning (spec P7). The deep coral #B23E1B (5.84:1 on white) is
 * the theme's "preparing" ink; the bright accent fails contrast as text.
 */

import type { ActivityIcon, ActivityTone } from "../../lib/activity/describe";
import type { StoreActivityEvent } from "../../lib/activity/store-event";
import { colors } from "../../theme/colors";
import type { IconName } from "../Icon";

export const MONEY_OUT_INK = colors.statusPreparing.text;

export const ACTIVITY_ICON_GLYPHS: Readonly<Record<ActivityIcon, IconName>> = {
  order: "orders",
  cancel: "close",
  refund: "undo",
  money: "payments",
  cash: "drawer",
  stock: "stock",
  alert: "warning",
  loyalty: "gift",
  menu: "manage",
  team: "customers",
  approval: "check",
};

interface TileLook {
  ink: string;
  tint: string;
}

const TONE_TILES: Readonly<Record<ActivityTone, TileLook>> = {
  negative: { ink: MONEY_OUT_INK, tint: colors.accentLight },
  positive: { ink: colors.success, tint: colors.successLight },
  warning: { ink: colors.statusPending.text, tint: colors.statusPending.bg },
  neutral: { ink: colors.textPrimary, tint: colors.surfaceSubtle },
};

export function tileLook(tone: ActivityTone): TileLook {
  return TONE_TILES[tone];
}

export function amountInk(tone: ActivityTone): string {
  return tone === "negative" ? MONEY_OUT_INK : colors.textPrimary;
}

/** Kinds a customer (not a staff member, not the system) starts. */
const CUSTOMER_KINDS: ReadonlySet<string> = new Set(["order.placed", "loyalty.reward_claimed", "loyalty.stamps_earned"]);

export type ActorMark = { kind: "person"; name: string } | { kind: "system" } | { kind: "customer" };

export function actorMark(event: StoreActivityEvent): ActorMark {
  if (event.actorName) return { kind: "person", name: event.actorName };
  return CUSTOMER_KINDS.has(event.kind) ? { kind: "customer" } : { kind: "system" };
}
