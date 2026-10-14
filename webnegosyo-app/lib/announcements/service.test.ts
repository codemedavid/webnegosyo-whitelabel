/**
 * The platform device token is filed per device and keyed by token. On a
 * shared tablet the row must leave with the person who signs out, or the next
 * person's phone keeps getting the previous account's approval pushes
 * (security review L1).
 */
const mockUpsert = jest.fn();
const mockDeleteEq = jest.fn();
const mockFrom = jest.fn((table: string) => ({
  table,
  upsert: mockUpsert,
  delete: () => ({ eq: mockDeleteEq }),
}));

jest.mock("../supabase", () => ({ supabase: { from: (table: string) => mockFrom(table) } }));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { forgetPlatformDeviceToken, upsertPlatformDeviceToken } from "./service";

beforeEach(() => {
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mockDeleteEq.mockReset().mockResolvedValue({ error: null });
  mockFrom.mockClear();
});

describe("platform device token", () => {
  test("forgets nothing before a token was filed", async () => {
    await forgetPlatformDeviceToken();
    expect(mockDeleteEq).not.toHaveBeenCalled();
  });

  test("deletes exactly this device's row on sign-out, once", async () => {
    await upsertPlatformDeviceToken({ token: "ExponentPushToken[a]", userId: "u1", tenantId: "t1", channels: ["approvals"] });
    await forgetPlatformDeviceToken();
    expect(mockFrom).toHaveBeenLastCalledWith("platform_device_tokens");
    expect(mockDeleteEq).toHaveBeenCalledWith("token", "ExponentPushToken[a]");
    await forgetPlatformDeviceToken();
    expect(mockDeleteEq).toHaveBeenCalledTimes(1);
  });

  test("retries the upsert without channels on a database that lacks the column", async () => {
    mockUpsert
      .mockResolvedValueOnce({ error: { code: "PGRST204", message: "Could not find the 'channels' column" } })
      .mockResolvedValueOnce({ error: null });
    await upsertPlatformDeviceToken({ token: "t", userId: "u1", tenantId: "t1", channels: ["approvals"] });
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert.mock.calls[1][0]).not.toHaveProperty("channels");
  });

  test("a failed delete is tolerated", async () => {
    await upsertPlatformDeviceToken({ token: "t2", userId: "u1", tenantId: "t1" });
    mockDeleteEq.mockResolvedValueOnce({ error: { message: "offline" } });
    await expect(forgetPlatformDeviceToken()).resolves.toBeUndefined();
  });
});
