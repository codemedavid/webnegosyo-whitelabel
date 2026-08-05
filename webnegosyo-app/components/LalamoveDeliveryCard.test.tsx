/**
 * The delivery card on the order screen.
 *
 * Two things had to be true before a merchant could work a Lalamove delivery
 * from the app, and on a platform-backed store neither was:
 *
 *  1. the order has to carry its Lalamove fields (fixed in the DTO mapper), and
 *  2. Book / Sync / Cancel have to reach a backend that exists.
 *
 * (2) is what this file covers. The buttons were bound straight to Convex
 * actions, and a store on the shared platform Supabase has no Convex
 * deployment — so every tap failed with "Convex not connected" no matter how
 * the order looked. These tests pin the routing: a platform store goes to the
 * web route, a Convex store keeps using its own deployment.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { LalamoveDeliveryCard } from "./LalamoveDeliveryCard";

const mockRunPlatformLalamoveOp = jest.fn();
const mockConvexAction = jest.fn();
let mockSession: Record<string, unknown>;

// Only the HTTP client is stubbed. `resolveLalamoveTransport` lives in its own
// pure module and runs for real here — the routing decision is what these tests
// are about, so faking it would leave the defect uncovered.
jest.mock("../lib/lalamove-service", () => ({
  runPlatformLalamoveOp: (...args: unknown[]) => mockRunPlatformLalamoveOp(...args),
}));

jest.mock("../lib/hooks", () => ({
  useSafeAction: () => mockConvexAction,
}));

jest.mock("../stores/auth-store", () => {
  const useAuthStore = (selector: (s: Record<string, unknown>) => unknown) =>
    selector(mockSession);
  useAuthStore.getState = () => mockSession;
  return { useAuthStore };
});

const QUOTED = { _id: "o1", lalamoveQuotationId: "quote-1" };
const BOOKED = {
  _id: "o1",
  lalamoveQuotationId: "quote-1",
  lalamoveOrderId: "lala-1",
  lalamoveStatus: "ON_GOING",
  lalamoveTrackingUrl: "https://share.lalamove.com/lala-1",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { tenantId: "t1", convexUrl: null, orderBackend: "platform", isDemo: false };
  mockRunPlatformLalamoveOp.mockResolvedValue({ success: true });
  mockConvexAction.mockResolvedValue({ success: true });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("a store with no Convex deployment", () => {
  it("books through the web route instead of a Convex action", async () => {
    // Arrange
    render(<LalamoveDeliveryCard order={QUOTED} />);

    // Act
    fireEvent.press(screen.getByText(/Book Lalamove Delivery/i));

    // Assert
    await waitFor(() => expect(mockRunPlatformLalamoveOp).toHaveBeenCalled());
    expect(mockRunPlatformLalamoveOp).toHaveBeenCalledWith(
      expect.objectContaining({ op: "book", tenantId: "t1", orderId: "o1" }),
    );
    expect(mockConvexAction).not.toHaveBeenCalled();
  });

  it("syncs a booked delivery through the web route", async () => {
    // Arrange
    render(<LalamoveDeliveryCard order={BOOKED} />);

    // Act
    fireEvent.press(screen.getByText("Sync"));

    // Assert
    await waitFor(() =>
      expect(mockRunPlatformLalamoveOp).toHaveBeenCalledWith(
        expect.objectContaining({ op: "sync", orderId: "o1" }),
      ),
    );
  });

  it("shows the server's reason when a booking is refused", async () => {
    // Arrange: "Quotation expired" tells a merchant to re-quote. A generic
    // failure leaves them tapping a button that will never work.
    mockRunPlatformLalamoveOp.mockResolvedValue({ success: false, error: "Quotation expired" });
    render(<LalamoveDeliveryCard order={QUOTED} />);

    // Act
    fireEvent.press(screen.getByText(/Book Lalamove Delivery/i));

    // Assert
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Lalamove", "Quotation expired"),
    );
  });
});

describe("a store on its own Convex deployment", () => {
  it("keeps using the Convex action", async () => {
    // Arrange
    mockSession = {
      tenantId: "t1",
      convexUrl: "https://x.convex.cloud",
      orderBackend: "convex",
      isDemo: false,
    };
    render(<LalamoveDeliveryCard order={QUOTED} />);

    // Act
    fireEvent.press(screen.getByText(/Book Lalamove Delivery/i));

    // Assert
    await waitFor(() => expect(mockConvexAction).toHaveBeenCalledWith({ orderId: "o1" }));
    expect(mockRunPlatformLalamoveOp).not.toHaveBeenCalled();
  });
});

describe("what the merchant can see", () => {
  it("shows the live status and a way to track a booked delivery", () => {
    // Arrange + Act
    render(<LalamoveDeliveryCard order={BOOKED} />);

    // Assert
    expect(screen.getByText("ON_GOING")).toBeTruthy();
    expect(screen.getByText("Track")).toBeTruthy();
  });

  it("stays hidden on an order that never had a delivery quoted", () => {
    // Arrange + Act: a counter sale must not grow a Lalamove panel.
    render(<LalamoveDeliveryCard order={{ _id: "o1" }} />);

    // Assert
    expect(screen.queryByText(/Lalamove/i)).toBeNull();
  });

  it("explains itself rather than offering a button that cannot work", () => {
    // Arrange: a per-tenant Supabase project — the app ships no adapter, so
    // there is no transport. Silently showing Book would fail every tap.
    mockSession = { tenantId: "t1", convexUrl: null, orderBackend: "supabase", isDemo: false };

    // Act
    render(<LalamoveDeliveryCard order={QUOTED} />);

    // Assert
    expect(screen.queryByText(/Book Lalamove Delivery/i)).toBeNull();
    expect(screen.getByText(/dashboard/i)).toBeTruthy();
  });
});
