/**
 * The consultation link is configurable per build, so it is opened through
 * the same allowlist as every other URL the app did not author.
 */
const mockOpenExternalUrl = jest.fn();
jest.mock("./safe-url", () => ({ openExternalUrl: (url: unknown) => mockOpenExternalUrl(url) }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

import { openConsultation, CONSULTATION_MESSENGER_URL } from "./consultation";

beforeEach(() => mockOpenExternalUrl.mockReset());

describe("openConsultation", () => {
  it("opens the Messenger thread through the URL allowlist", async () => {
    mockOpenExternalUrl.mockResolvedValue(true);
    await expect(openConsultation()).resolves.toBe(true);
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(CONSULTATION_MESSENGER_URL);
    expect(CONSULTATION_MESSENGER_URL).toMatch(/^https:\/\/m\.me\//);
  });

  it("reports false when the allowlist refuses the configured url", async () => {
    mockOpenExternalUrl.mockResolvedValue(false);
    await expect(openConsultation("intent://evil")).resolves.toBe(false);
  });
});
