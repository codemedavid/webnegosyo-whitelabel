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

/** Press a button on the most recent alert that has one matching `matcher`. */
function pressAlertButton(matcher: RegExp) {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const buttons = calls[i][2] as Array<{ text?: string; onPress?: () => void }> | undefined;
    const button = buttons?.find((b) => b.text && matcher.test(b.text));
    if (button?.onPress) {
      button.onPress();
      return;
    }
  }
  throw new Error(`No alert button matching ${matcher}`);
}

describe("a store with no Convex deployment", () => {
  it("books through the web route instead of a Convex action", async () => {
    // Arrange
    render(<LalamoveDeliveryCard order={QUOTED} />);

    // Act — booking costs real money, so a confirmation stands between the
    // tap and the rider.
    fireEvent.press(screen.getByText(/Book Lalamove Delivery/i));
    expect(mockRunPlatformLalamoveOp).not.toHaveBeenCalled();
    pressAlertButton(/book/i);

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
    pressAlertButton(/book/i);

    // Assert
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Lalamove",
        "Quotation expired",
        expect.anything(),
      ),
    );
  });

  it("offers a fresh quote right from the expired-booking failure", async () => {
    // Arrange: the quotation died at checkout + 5 minutes. The failure alert
    // itself must carry the recovery — sending the merchant to hunt for a
    // separate button loses them.
    mockRunPlatformLalamoveOp.mockResolvedValueOnce({
      success: false,
      error: "Quotation expired",
    });
    render(<LalamoveDeliveryCard order={QUOTED} />);
    fireEvent.press(screen.getByText(/Book Lalamove Delivery/i));
    pressAlertButton(/book/i);
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Lalamove", "Quotation expired", expect.anything()),
    );

    // Act
    mockRunPlatformLalamoveOp.mockResolvedValue({ success: true });
    pressAlertButton(/new quote/i);

    // Assert
    await waitFor(() =>
      expect(mockRunPlatformLalamoveOp).toHaveBeenCalledWith(
        expect.objectContaining({ op: "requote", orderId: "o1" }),
      ),
    );
  });

  it("has a Get New Quote action on the unbooked card", async () => {
    // Arrange
    render(<LalamoveDeliveryCard order={QUOTED} />);

    // Act
    fireEvent.press(screen.getByText(/Get New Quote/i));

    // Assert
    await waitFor(() =>
      expect(mockRunPlatformLalamoveOp).toHaveBeenCalledWith(
        expect.objectContaining({ op: "requote", orderId: "o1" }),
      ),
    );
  });

  it("auto-syncs an active delivery without anyone pressing Sync", async () => {
    // Arrange: driver assignment used to be invisible until a human tapped
    // Sync. An active delivery now re-polls itself.
    jest.useFakeTimers();
    try {
      render(<LalamoveDeliveryCard order={BOOKED} />);
      expect(mockRunPlatformLalamoveOp).not.toHaveBeenCalled();

      // Act
      await jest.advanceTimersByTimeAsync(46_000);

      // Assert
      expect(mockRunPlatformLalamoveOp).toHaveBeenCalledWith(
        expect.objectContaining({ op: "sync", orderId: "o1" }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not poll a delivery that has already finished", async () => {
    // Arrange
    jest.useFakeTimers();
    try {
      render(
        <LalamoveDeliveryCard order={{ ...BOOKED, lalamoveStatus: "COMPLETED" }} />,
      );

      // Act
      await jest.advanceTimersByTimeAsync(120_000);

      // Assert
      expect(mockRunPlatformLalamoveOp).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
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
    pressAlertButton(/book/i);

    // Assert
    await waitFor(() => expect(mockConvexAction).toHaveBeenCalledWith({ orderId: "o1" }));
    expect(mockRunPlatformLalamoveOp).not.toHaveBeenCalled();
  });
});

describe("what the merchant can see", () => {
  it("shows the live status and a way to track a booked delivery", () => {
    // Arrange + Act
    render(<LalamoveDeliveryCard order={BOOKED} />);

    // Assert — the raw API status ("ON_GOING") reads as jargon; the merchant
    // sees words.
    expect(screen.getByText("Driver assigned")).toBeTruthy();
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
