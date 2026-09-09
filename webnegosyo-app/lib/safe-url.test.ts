/**
 * The one door through which the app opens a URL it did not author.
 *
 * Payment-proof links, Lalamove tracking links and announcement links all
 * arrive from a server or a merchant. `Linking.openURL` will happily hand an
 * `intent:`, `file:` or custom-scheme URL to the OS; only web pages, mail and
 * phone numbers are ever meant to be opened from here.
 */

const mockOpenURL = jest.fn<Promise<void>, [string]>();

jest.mock("react-native", () => ({
  Linking: { openURL: (url: string) => mockOpenURL(url) },
}));

import { isSafeExternalUrl, openExternalUrl } from "./safe-url";

beforeEach(() => {
  mockOpenURL.mockReset();
  mockOpenURL.mockResolvedValue(undefined);
});

describe("isSafeExternalUrl", () => {
  it.each([
    "https://example.com/proof.jpg",
    "http://example.com",
    "HTTPS://EXAMPLE.COM",
    "mailto:help@example.com",
    "tel:+639171234567",
  ])("accepts %s", (url) => {
    expect(isSafeExternalUrl(url)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "intent://scan/#Intent;scheme=zxing;end",
    "sms:+639171234567",
    "data:text/html,<script>",
    "https:",
    "http://",
    "example.com",
    "",
    "   ",
    " https://example.com",
  ])("rejects %p", (url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ["https://example.com"]])("rejects non-string %p", (value) => {
    expect(isSafeExternalUrl(value)).toBe(false);
  });
});

describe("openExternalUrl", () => {
  it("opens a safe URL and reports success", async () => {
    await expect(openExternalUrl("https://example.com")).resolves.toBe(true);
    expect(mockOpenURL).toHaveBeenCalledWith("https://example.com");
  });

  it("does nothing for an unsafe URL", async () => {
    await expect(openExternalUrl("javascript:alert(1)")).resolves.toBe(false);
    await expect(openExternalUrl(null)).resolves.toBe(false);
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it("reports false when the OS cannot open the URL", async () => {
    mockOpenURL.mockRejectedValue(new Error("no handler"));
    await expect(openExternalUrl("https://example.com")).resolves.toBe(false);
  });
});
