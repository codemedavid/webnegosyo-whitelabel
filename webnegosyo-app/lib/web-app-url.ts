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
  return followMetroHost(url).replace(/\/+$/, "");
}

/** localhost, 127.x, 10.x, 172.16–31.x, 192.168.x: this Mac as a dev build sees it. */
const LOCAL_HOST_PATTERN =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
const LOCAL_HTTP_URL_PATTERN = /^http:\/\/([^/:]+)(:\d+)?(\/.*)?$/;

/**
 * A dev build pointed at this Mac's `next dev` has that address baked into its
 * bundle, and the address changes whenever the Mac joins another network —
 * then every web call runs into its deadline. Metro's host is the Mac's
 * CURRENT address (the phone just loaded its bundle from it), so a local dev
 * server follows it. Release builds, deployed hosts and tunnels are untouched.
 */
function followMetroHost(url: string): string {
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  if (!isDev) return url;

  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0] ?? "";
  if (!LOCAL_HOST_PATTERN.test(metroHost)) return url;

  const match = LOCAL_HTTP_URL_PATTERN.exec(url);
  if (!match || !LOCAL_HOST_PATTERN.test(match[1])) return url;

  return `http://${metroHost}${match[2] ?? ""}${match[3] ?? ""}`;
}
