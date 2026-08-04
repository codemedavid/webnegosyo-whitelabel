const mockConstants: { expoConfig: { extra: Record<string, unknown> } | null } = {
  expoConfig: { extra: {} },
};
jest.mock("expo-constants", () => ({
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
