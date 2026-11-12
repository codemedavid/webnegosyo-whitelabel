const mockConstants: { expoConfig: { extra: Record<string, unknown>; hostUri?: string } | null } = {
  expoConfig: { extra: {} },
};
jest.mock("expo-constants", () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
}));

import { getWebAppUrl } from "./web-app-url";

/**
 * Where the register sends the calls it cannot make itself.
 *
 * Six modules held their own copy of this and all six defaulted to the bare
 * apex domain, which 307-redirects to `www`. A redirect is not free here: it
 * doubles the round trip on a counter connection, and it is the shape of
 * request — POST, with a body and an Authorization header — that phone
 * networking stacks are least reliable at replaying. A cashier waiting on a
 * voucher code is the person who pays for that.
 *
 * The canonical host is not an optimisation, it is the address. One copy, so
 * correcting it cannot leave five modules behind.
 */
describe("getWebAppUrl", () => {
  afterEach(() => {
    mockConstants.expoConfig = { extra: {} };
  });

  it("defaults to the canonical host rather than one that redirects", () => {
    expect(getWebAppUrl()).toBe("https://www.webnegosyo.com");
  });

  it("prefers the host the build was configured with", () => {
    // Arrange — a staging or preview deployment.
    mockConstants.expoConfig = { extra: { webAppUrl: "https://staging.example.com" } };

    // Act & Assert
    expect(getWebAppUrl()).toBe("https://staging.example.com");
  });

  it("falls back when the app config is missing entirely", () => {
    // Arrange — Expo has handed us no config at all, which happens in bare
    // contexts. A crash here would take out every server-mediated feature.
    mockConstants.expoConfig = null;

    // Act & Assert
    expect(getWebAppUrl()).toBe("https://www.webnegosyo.com");
  });

  it("never leaves a trailing slash for callers to double up on", () => {
    // Arrange — callers all build `${getWebAppUrl()}/api/...`, so a configured
    // value with a slash would produce `//api/...`.
    mockConstants.expoConfig = { extra: { webAppUrl: "https://staging.example.com/" } };

    // Act & Assert
    expect(getWebAppUrl()).toBe("https://staging.example.com");
  });
});

/**
 * A dev build pointed at this Mac's `next dev` (`EXPO_PUBLIC_WEB_APP_URL=
 * http://<lan ip>:3000`) froze that address into the bundle. When the Mac moved
 * Wi-Fi networks its address changed, every web call (Reports' customer
 * figures, vouchers, stock, the Owl) ran into its 15 s deadline, and Reports
 * said "Customer figures could not be loaded" (2026-11-05). Metro's own host is
 * the Mac's CURRENT address — the phone just loaded its bundle from there — so
 * a LAN dev server follows it.
 */
describe("getWebAppUrl in a dev build pointed at this Mac", () => {
  const globals = globalThis as { __DEV__?: boolean };
  const wasDev = globals.__DEV__;

  beforeEach(() => {
    globals.__DEV__ = true;
  });

  afterEach(() => {
    globals.__DEV__ = wasDev;
    mockConstants.expoConfig = { extra: {} };
  });

  it("follows Metro to the Mac's current LAN address", () => {
    // Arrange — configured on yesterday's network, served from today's.
    mockConstants.expoConfig = {
      extra: { webAppUrl: "http://192.168.18.188:3000" },
      hostUri: "192.168.100.52:8081",
    };

    // Act & Assert — same scheme and port, Metro's host.
    expect(getWebAppUrl()).toBe("http://192.168.100.52:3000");
  });

  it("follows Metro to localhost on a simulator", () => {
    mockConstants.expoConfig = {
      extra: { webAppUrl: "http://192.168.18.188:3000" },
      hostUri: "localhost:8081",
    };

    expect(getWebAppUrl()).toBe("http://localhost:3000");
  });

  it("leaves a deployed web app alone", () => {
    // Arrange — a dev build deliberately talking to staging or production.
    mockConstants.expoConfig = {
      extra: { webAppUrl: "https://staging.example.com" },
      hostUri: "192.168.100.52:8081",
    };

    expect(getWebAppUrl()).toBe("https://staging.example.com");
  });

  it("leaves the default production host alone", () => {
    mockConstants.expoConfig = { extra: {}, hostUri: "192.168.100.52:8081" };

    expect(getWebAppUrl()).toBe("https://www.webnegosyo.com");
  });

  it("keeps the configured address when Metro runs over a tunnel", () => {
    // Arrange — a tunnel host is not this Mac's LAN address; port 3000 is not on it.
    mockConstants.expoConfig = {
      extra: { webAppUrl: "http://192.168.18.188:3000" },
      hostUri: "abc-anonymous-8081.exp.direct",
    };

    expect(getWebAppUrl()).toBe("http://192.168.18.188:3000");
  });

  it("keeps the configured address when Metro's host is unknown", () => {
    mockConstants.expoConfig = { extra: { webAppUrl: "http://192.168.18.188:3000" } };

    expect(getWebAppUrl()).toBe("http://192.168.18.188:3000");
  });

  it("never rewrites a release build", () => {
    // Arrange — release bundles carry no Metro host, but be explicit anyway.
    globals.__DEV__ = false;
    mockConstants.expoConfig = {
      extra: { webAppUrl: "http://192.168.18.188:3000" },
      hostUri: "192.168.100.52:8081",
    };

    expect(getWebAppUrl()).toBe("http://192.168.18.188:3000");
  });
});
