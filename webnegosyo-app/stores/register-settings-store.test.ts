/**
 * Per-device register settings.
 *
 * These are device settings, not tenant settings: whether THIS till counts
 * online orders in its drawer depends on whether this till is the one taking
 * the money, which only the person standing at it knows.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRegisterSettingsStore } from "./register-settings-store";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe("useRegisterSettingsStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRegisterSettingsStore.setState({ drawerIncludesOnlineOrders: false });
  });

  it("leaves online orders out of the drawer until the merchant opts in", () => {
    // Assert — the safe default is today's behaviour.
    expect(useRegisterSettingsStore.getState().drawerIncludesOnlineOrders).toBe(false);
  });

  it("persists the choice so it survives a shift change", async () => {
    // Act
    await useRegisterSettingsStore.getState().setDrawerIncludesOnlineOrders(true);

    // Assert
    expect(useRegisterSettingsStore.getState().drawerIncludesOnlineOrders).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith("drawer_includes_online", "true");
  });

  it("restores a saved choice on start-up", async () => {
    // Arrange
    storage.getItem.mockResolvedValueOnce("true");

    // Act
    await useRegisterSettingsStore.getState().loadSaved();

    // Assert
    expect(useRegisterSettingsStore.getState().drawerIncludesOnlineOrders).toBe(true);
  });

  it("keeps the safe default when storage is empty or corrupt", async () => {
    // Arrange
    storage.getItem.mockResolvedValueOnce(null);

    // Act
    await useRegisterSettingsStore.getState().loadSaved();

    // Assert
    expect(useRegisterSettingsStore.getState().drawerIncludesOnlineOrders).toBe(false);
  });

  it("does not throw when the device storage rejects the write", async () => {
    // Arrange — a failed persist must never take the register down mid-shift.
    storage.setItem.mockRejectedValueOnce(new Error("disk full"));

    // Act + Assert
    await expect(
      useRegisterSettingsStore.getState().setDrawerIncludesOnlineOrders(true),
    ).resolves.toBeUndefined();
    expect(useRegisterSettingsStore.getState().drawerIncludesOnlineOrders).toBe(true);
  });
});
