import { deviceCredentialStore, isDeviceCredentialStorageAvailable } from "./sms-delivery-runtime";

jest.mock("expo-secure-store", () => { throw new Error("Cannot find native module 'ExpoSecureStore'"); });
jest.mock("../supabase", () => ({ supabase: {} }));
jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://example.test" }));
jest.mock("@react-native-async-storage/async-storage", () => ({}));
jest.mock("../../modules/sms-sender", () => ({ SmsSenderModule: null }));

test("an existing binary without SecureStore can import the gated runtime and read no enrollment", async () => {
  expect(isDeviceCredentialStorageAvailable()).toBe(false);
  const store = deviceCredentialStore({
    tenantId: "11111111-1111-4111-8111-111111111111",
    actorId: "22222222-2222-4222-8222-222222222222",
  });
  await expect(store.read()).resolves.toBeNull();
  await expect(store.write({ deviceId: "33333333-3333-4333-8333-333333333333", credential: "A".repeat(43) })).rejects.toThrow();
});
