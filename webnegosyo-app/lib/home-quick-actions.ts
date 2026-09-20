/**
 * The shortcuts row on Home.
 *
 * A financial app puts the two or three things you came to do under the
 * balance — send, add, request — so they never cost a hunt through the tabs.
 * The merchant's equivalents: ring up a sale, check the pass, fix a product.
 * Scanning a pickup is NOT among them: the QR button sits in Home's header on
 * every render, and a tile repeating it spent a quarter of the row saying the
 * same thing twice. Each is a real screen, so each is gated by the same
 * rule as everything else (lib/tab-visibility.ts); the row simply drops any
 * the account may not open, and disappears if fewer than two survive — one
 * lonely tile reads as a mistake, not a shortcut.
 */

import { isTabReachable, type TabVisibilityContext } from "./tab-visibility";
import type { IconName } from "../components/Icon";

export interface QuickAction {
  key: string;
  label: string;
  icon: IconName;
  /** Fully-substituted href inside the tab navigator. */
  href: string;
  /** The tab whose reachability gates the action. */
  gateTab: string;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { key: "sell", label: "New sale", icon: "register", href: "/(main)/pos", gateTab: "pos" },
  { key: "kitchen", label: "Kitchen", icon: "kitchen", href: "/(main)/kitchen", gateTab: "kitchen" },
  {
    key: "products",
    label: "Products",
    icon: "manage",
    href: "/(main)/product-management",
    gateTab: "product-management",
  },
];

/** Fewer than this and the row is hidden rather than drawn half-empty. */
export const MIN_QUICK_ACTIONS = 2;

export function quickActionsFor(ctx: TabVisibilityContext): QuickAction[] {
  const allowed = QUICK_ACTIONS.filter((action) => isTabReachable(action.gateTab, ctx));
  return allowed.length >= MIN_QUICK_ACTIONS ? allowed : [];
}
