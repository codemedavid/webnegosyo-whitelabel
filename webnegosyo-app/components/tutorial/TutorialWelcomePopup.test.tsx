/**
 * The greeter: shows exactly once to a fresh merchant, never to a superadmin,
 * and goes quiet whichever button is tapped. The stores are driven directly;
 * the hooks that would query branches and pre-order config are stubbed to
 * their single-location defaults so the test stays about the greeter.
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../lib/use-portfolio-audience", () => ({
  usePortfolioAudience: () => ({ accountScope: { kind: "all" }, activeOutletCount: 1, isDemo: false }),
}));
jest.mock("../../lib/use-advance-ordering", () => ({ useAdvanceOrdering: () => false }));

import { router } from "expo-router";
import { TutorialWelcomePopup } from "./TutorialWelcomePopup";
import { useAuthStore } from "../../stores/auth-store";
import { useTutorialStore } from "../../stores/tutorial-store";
import { EMPTY_PROGRESS } from "../../lib/tutorial/progress";

const signIn = (overrides: Partial<ReturnType<typeof useAuthStore.getState>> = {}) =>
  useAuthStore.setState({
    isAuthenticated: true,
    userId: "user-1",
    tenantName: "Maria's Kitchen",
    isOwner: true,
    isDemo: false,
    isSuperadmin: false,
    impersonatedTenantId: null,
    role: "admin",
    permissions: null,
    ...overrides,
  });

describe("TutorialWelcomePopup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTutorialStore.setState({ scope: null, progress: EMPTY_PROGRESS, isLoaded: false });
  });

  it("greets a fresh merchant by store name and starts the tour", async () => {
    signIn();
    render(<TutorialWelcomePopup />);

    expect(await screen.findByText("Maria's Kitchen is live")).toBeTruthy();
    fireEvent.press(screen.getByText("Start the tour"));

    expect(router.push).toHaveBeenCalledWith("/(main)/tutorial");
    expect(useTutorialStore.getState().progress.welcomeSeen).toBe(true);
    expect(screen.queryByText("Maria's Kitchen is live")).toBeNull();
  });

  it("goes quiet when declined and stays quiet afterwards", async () => {
    signIn();
    render(<TutorialWelcomePopup />);

    fireEvent.press(await screen.findByText("I'll explore on my own"));

    expect(router.push).not.toHaveBeenCalled();
    expect(useTutorialStore.getState().progress.welcomeSeen).toBe(true);
    expect(screen.queryByText("Start the tour")).toBeNull();
  });

  it("never greets a superadmin viewing a store", async () => {
    signIn({ isSuperadmin: true, impersonatedTenantId: "t-1" });
    render(<TutorialWelcomePopup />);

    await act(async () => {});
    expect(screen.queryByText("Start the tour")).toBeNull();
  });
});
