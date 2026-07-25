import { render } from "@testing-library/react";
import { RealtimeOrdersWrapper } from "@/components/admin/realtime-orders-wrapper";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { createTenantOrderRealtimeClient } from "@/lib/supabase/tenant-order-client";

/**
 * P5 wiring guard: the admin queue must subscribe to whichever project holds the
 * tenant's orders, and must reach it with the anon key only — the service-role
 * key never belongs in a browser bundle.
 *
 * Written after the wiring (the component is thin glue), so this is a
 * regression guard rather than a RED-first cycle. It was mutation-checked:
 * dropping the `client` prop from the hook call makes the first case fail.
 */

jest.mock("@/hooks/use-realtime-orders", () => ({
  useRealtimeOrders: jest.fn(() => ({ isConnected: true })),
}));

jest.mock("@/lib/supabase/tenant-order-client", () => ({
  createTenantOrderRealtimeClient: jest.fn(() => ({ id: "tenant-client" })),
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
const mockedFactory = createTenantOrderRealtimeClient as jest.MockedFunction<
  typeof createTenantOrderRealtimeClient
>;

const BASE_PROPS = {
  initialOrders: [],
  tenantSlug: "acme",
  tenantId: "tenant-1",
};

describe("RealtimeOrdersWrapper backend selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("subscribes on the tenant's own project when its credentials are supplied", () => {
    render(
      <RealtimeOrdersWrapper
        {...BASE_PROPS}
        realtimeUrl="https://tenant.supabase.co"
        realtimeAnonKey="anon-key"
      />
    );

    expect(mockedFactory).toHaveBeenCalledWith({
      supabase_order_url: "https://tenant.supabase.co",
      supabase_order_anon_key: "anon-key",
    });
    expect(mockedHook.mock.calls[0][0].client).toEqual({ id: "tenant-client" });
  });

  it("leaves the hook on the platform client for a platform-backed tenant", () => {
    render(<RealtimeOrdersWrapper {...BASE_PROPS} />);

    expect(mockedFactory).not.toHaveBeenCalled();
    expect(mockedHook.mock.calls[0][0].client).toBeUndefined();
  });

  it("builds the browser client from the anon key alone", () => {
    render(
      <RealtimeOrdersWrapper
        {...BASE_PROPS}
        realtimeUrl="https://tenant.supabase.co"
        realtimeAnonKey="anon-key"
      />
    );

    const credentials = mockedFactory.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(credentials)).toEqual([
      "supabase_order_url",
      "supabase_order_anon_key",
    ]);
    expect(JSON.stringify(credentials)).not.toContain("service");
  });

  it("does not build a tenant client from a half-configured tenant", () => {
    render(
      <RealtimeOrdersWrapper {...BASE_PROPS} realtimeUrl="https://tenant.supabase.co" />
    );

    expect(mockedFactory).not.toHaveBeenCalled();
    expect(mockedHook.mock.calls[0][0].client).toBeUndefined();
  });
});
