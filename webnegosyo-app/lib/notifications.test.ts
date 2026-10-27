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
const mockSetCategory = jest.fn().mockResolvedValue(null);

jest.mock("expo-notifications", () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetChannel(...args),
  deleteNotificationChannelAsync: (...args: unknown[]) => mockDeleteChannel(...args),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationCategoryAsync: (...args: unknown[]) => mockSetCategory(...args),
  AndroidImportance: { MAX: 5, HIGH: 4 },
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

describe("approvals channel and categories", () => {
  beforeEach(() => {
    jest.resetModules();
    mockSetChannel.mockClear();
    mockSetCategory.mockClear();
  });

  async function loadNotifications() {
    return (await import("./notifications")) as typeof import("./notifications");
  }

  it("creates a HIGH approvals channel without the order ringtone, and reports it", async () => {
    const { ensureApprovalsChannel, deviceChannels } = await loadNotifications();
    expect(deviceChannels()).toEqual([]);
    await expect(ensureApprovalsChannel()).resolves.toBe(true);

    const [channelId, config] = mockSetChannel.mock.calls[0] as [string, Record<string, unknown>];
    expect(channelId).toBe("approvals");
    expect(config).toMatchObject({ importance: 4 });
    expect(config.sound).not.toBe("ringtone.mp3");
    expect(deviceChannels()).toEqual(["approvals"]);
  });

  it("does not report the channel when creating it failed", async () => {
    mockSetChannel.mockRejectedValueOnce(new Error("no"));
    const { ensureApprovalsChannel, deviceChannels } = await loadNotifications();
    await expect(ensureApprovalsChannel()).resolves.toBe(false);
    expect(deviceChannels()).toEqual([]);
  });

  it("registers the approval category with Approve and Decline", async () => {
    const { ensureApprovalCategories } = await loadNotifications();
    await ensureApprovalCategories();
    const [identifier, actions] = mockSetCategory.mock.calls[0] as [string, { identifier: string }[]];
    expect(identifier).toBe("approval_within_limit");
    expect(actions.map((action) => action.identifier)).toEqual(["approve", "decline"]);
  });
});

describe("cash alerts channel (CONTRACTS W3.3)", () => {
  beforeEach(() => {
    jest.resetModules();
    mockSetChannel.mockClear();
  });

  it("creates a HIGH 'Cash alerts' channel that never uses the order ringtone", async () => {
    const { ensureCashAlertsChannel, CASH_ALERTS_CHANNEL_ID } = (await import("./notifications")) as typeof import("./notifications");
    await ensureCashAlertsChannel();
    await ensureCashAlertsChannel();
    expect(mockSetChannel).toHaveBeenCalledTimes(1);
    const [channelId, config] = mockSetChannel.mock.calls[0] as [string, Record<string, unknown>];
    expect(channelId).toBe(CASH_ALERTS_CHANNEL_ID);
    expect(config).toMatchObject({ name: "Cash alerts", importance: 4 });
    expect(config.sound).not.toBe("ringtone.mp3");
  });

  it("uses the same channel id the web push route sends cash alerts on", async () => {
    const { readFileSync } = jest.requireActual<typeof import("fs")>("fs");
    const { join } = jest.requireActual<typeof import("path")>("path");
    const { CASH_ALERTS_CHANNEL_ID } = (await import("./notifications")) as typeof import("./notifications");
    const web = readFileSync(join(__dirname, "..", "..", "src", "lib", "push", "merchant-notification-push.ts"), "utf8");
    expect(web).toContain(`channelId: '${CASH_ALERTS_CHANNEL_ID}'`);
  });

  it("is created at startup next to the stock channel", () => {
    const { readFileSync } = jest.requireActual<typeof import("fs")>("fs");
    const { join } = jest.requireActual<typeof import("path")>("path");
    const layout = readFileSync(join(__dirname, "..", "app", "_layout.tsx"), "utf8");
    expect(layout).toMatch(/ensureStockAlertsChannel\(\)[\s\S]{0,80}ensureCashAlertsChannel\(\)/);
  });
});
