import Constants from "expo-constants";

/**
 * The web app the register calls for the things it cannot do on the phone.
 *
 * Reading a merchant's vouchers, burning a redemption, recording stock — each
 * goes through a route on the web app authenticated with the cashier's own
 * session token. Every one of those modules used to carry its own copy of this
 * function, and all of them defaulted to the apex domain, which 307-redirects
 * to `www`. That extra hop is worst exactly where it hurts: a POST carrying a
 * body and an Authorization header, over a counter connection, with a customer
 * waiting.
 */

/** The address, not a preference. Deployments serve `www` and redirect to it. */
const CANONICAL_WEB_APP_URL = "https://www.webnegosyo.com";

export function getWebAppUrl(): string {
  const configured = Constants.expoConfig?.extra?.webAppUrl;
  const url = typeof configured === "string" && configured.trim() !== ""
    ? configured.trim()
    : CANONICAL_WEB_APP_URL;

  // Callers all append `/api/...`, so a configured value ending in a slash
  // would build `//api/...` — which Next's router does not treat as the route.
  return url.replace(/\/+$/, "");
}
