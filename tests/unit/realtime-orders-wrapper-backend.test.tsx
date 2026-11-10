import { render } from "@testing-library/react";
import { RealtimeOrdersWrapper } from "@/components/admin/realtime-orders-wrapper";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";

/**
 * Wiring guard: the admin queue subscribes with the platform browser client.
 * The wrapper used to build a second client for a store's own Supabase project
 * (removed 2026-11-10); it must never hand the hook a client of its own again.
 */

jest.mock("@/hooks/use-realtime-orders", () => ({
  useRealtimeOrders: jest.fn(() => ({ isConnected: true })),
}));

jest.mock("@/components/admin/orders-list", () => ({
  OrdersList: () => null,
}));

jest.mock("@/lib/notification-utils", () => ({
  playNotificationSound: jest.fn(),
  showOrderNotification: jest.fn(),
  requestNotificationPermission: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const mockedHook = useRealtimeOrders as jest.MockedFunction<typeof useRealtimeOrders>;

const BASE_PROPS = {
  initialOrders: [],
  tenantSlug: "acme",
  tenantId: "tenant-1",
};

describe("RealtimeOrdersWrapper backend selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("leaves the hook on the platform client for a platform-backed tenant", () => {
    render(<RealtimeOrdersWrapper {...BASE_PROPS} />);

    expect(mockedHook.mock.calls[0][0].client).toBeUndefined();
    expect(mockedHook.mock.calls[0][0].tenantId).toBe("tenant-1");
  });
});
