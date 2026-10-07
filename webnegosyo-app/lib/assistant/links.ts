/**
 * Where an Owl link goes in the app.
 *
 * The server writes links as web admin paths (relative to /{tenant}/admin) so
 * one answer serves both surfaces. Each path the tools emit has an app screen;
 * anything without one (Boost Sales lives only on the web) opens the web admin
 * in the browser, the way Loyalty's web-only settings already do.
 */

import { productHref } from "../navigation";

export type OwlDestination = { kind: "app"; href: string } | { kind: "web"; url: string };

/** Web admin path → app route. Keep in step with the `links` the web tools write. */
const APP_ROUTES: Readonly<Record<string, string>> = {
  "": "/(main)/dashboard",
  "/inventory": "/(main)/inventory",
  "/staff": "/(main)/team",
  "/customers": "/(main)/customers",
  "/vouchers": "/(main)/vouchers",
  "/menu": "/(main)/product-management",
  "/loyalty": "/(main)/loyalty",
  "/orders": "/(main)/orders",
};

const MENU_ITEM_PATH = /^\/menu\/([0-9a-f-]{36})$/i;

export function resolveOwlLink(path: string, tenantSlug: string | null, webAppUrl: string): OwlDestination | null {
  const normalized = path.trim().replace(/\/+$/, "");
  if (Object.prototype.hasOwnProperty.call(APP_ROUTES, normalized)) {
    return { kind: "app", href: APP_ROUTES[normalized] };
  }
  const item = MENU_ITEM_PATH.exec(normalized);
  if (item) return { kind: "app", href: productHref(item[1]) };
  // Only relative admin paths are honoured: a link is never a way off-platform.
  if (!tenantSlug || !/^\/[a-z0-9/_-]*$/i.test(normalized)) return null;
  return { kind: "web", url: `${webAppUrl}/${encodeURIComponent(tenantSlug)}/admin${normalized}` };
}
