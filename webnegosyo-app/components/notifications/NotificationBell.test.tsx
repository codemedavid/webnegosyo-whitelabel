/**
 * The header bell: hidden for accounts that may not read notifications, an
 * unread count that caps at "9+", and a press that opens the list.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { formatBadgeCount } from "../IconButton";
import { NotificationBell } from "./NotificationBell";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const mockState = { isVisible: true, unread: 0 };
jest.mock("../../lib/merchant-notifications/use-merchant-notifications", () => ({
  useMerchantNotifications: () => mockState,
}));

describe("formatBadgeCount", () => {
  it("shows nothing at zero and caps past nine", () => {
    expect(formatBadgeCount(0)).toBeNull();
    expect(formatBadgeCount(undefined)).toBeNull();
    expect(formatBadgeCount(3)).toBe("3");
    expect(formatBadgeCount(12)).toBe("9+");
  });
});

describe("NotificationBell", () => {
  beforeEach(() => {
    mockState.isVisible = true;
    mockState.unread = 0;
    (router.push as jest.Mock).mockClear();
  });

  it("renders nothing for an account that may not read notifications", () => {
    mockState.isVisible = false;
    render(<NotificationBell />);
    expect(screen.queryByTestId("notification-bell")).toBeNull();
  });

  it("names the unread count for screen readers and shows the badge", () => {
    mockState.unread = 3;
    render(<NotificationBell />);
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows no badge when everything is read", () => {
    render(<NotificationBell />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByTestId("notification-bell-badge")).toBeNull();
  });

  it("opens the notifications list", () => {
    render(<NotificationBell />);
    fireEvent.press(screen.getByTestId("notification-bell"));
    expect(router.push).toHaveBeenCalledWith("/(main)/notifications");
  });
});
