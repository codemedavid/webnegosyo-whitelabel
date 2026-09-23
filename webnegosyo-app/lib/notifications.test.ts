/**
 * The Android "orders" channel is what makes a new order ring the custom
 * ringtone; every order push (`channelId: "orders"`) and every local order
 * alert targets it by name.
 *
 * It used to be DELETED and recreated on every launch, meaning to push new
 * sound settings onto devices that already had the channel. Android does not
 * work that way — recreating a channel under a deleted id restores the
 * original settings — so the delete bought nothing and cost something real: a
 * window at each launch in which an arriving order has no "orders" channel,
 * and expo-notifications quietly posts it to its low-importance fallback
 * channel instead. Silent, on the one notification this app exists to deliver.
 */
const mockSetChannel = jest.fn().mockResolvedValue(undefined);
const mockDeleteChannel = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-notifications", () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetChannel(...args),
  deleteNotificationChannelAsync: (...args: unknown[]) => mockDeleteChannel(...args),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

jest.mock("expo-device", () => ({ __esModule: true, isDevice: true }));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "test-project" } } } },
}));

jest.mock("react-native", () => ({ __esModule: true, Platform: { OS: "android" } }));

describe("ensureOrdersChannel", () => {
  beforeEach(() => {
    jest.resetModules();
    mockSetChannel.mockClear();
    mockDeleteChannel.mockClear();
  });

  /** Fresh module each time: the "already created" flag is per app session. */
  async function loadNotifications() {
    return (await import("./notifications")) as typeof import("./notifications");
  }

  it("creates the high-importance orders channel with the ringtone", async () => {
    const { ensureOrdersChannel } = await loadNotifications();
    await ensureOrdersChannel();

    expect(mockSetChannel).toHaveBeenCalledTimes(1);
    const [channelId, config] = mockSetChannel.mock.calls[0] as [string, Record<string, unknown>];
    expect(channelId).toBe("orders");
    expect(config).toMatchObject({ importance: 5, sound: "ringtone.mp3" });
  });

  it("never deletes the channel, so no launch has a window without one", async () => {
    const { ensureOrdersChannel } = await loadNotifications();
    await ensureOrdersChannel();
    await ensureOrdersChannel();

    expect(mockDeleteChannel).not.toHaveBeenCalled();
  });

  it("creates the channel once per session however often it is called", async () => {
    const { ensureOrdersChannel } = await loadNotifications();
    await ensureOrdersChannel();
    await ensureOrdersChannel();
    await ensureOrdersChannel();

    expect(mockSetChannel).toHaveBeenCalledTimes(1);
  });
});
