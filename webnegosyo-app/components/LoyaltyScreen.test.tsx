import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import LoyaltyScreen from "../app/(main)/loyalty";
import {
  fetchLoyaltyPrograms,
  reviseLoyaltyProgram,
} from "../lib/loyalty/repo";
jest.mock("../stores/auth-store", () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ tenantId: "tenant", tenantSlug: "shop" }),
}));
jest.mock("../lib/use-outlets", () => ({
  useOutlets: () => ({ outlets: [], error: null }),
}));
jest.mock("../lib/products", () => ({
  listProducts: async () => [
    { id: "latte", name: "Latte", is_available: true },
    { id: "presell", name: "Presell", is_available: true, presell_enabled: true },
  ],
}));
jest.mock("../lib/web-app-url", () => ({
  getWebAppUrl: () => "https://shop.test",
}));
jest.mock("../components/LoyaltySmsDeviceCard", () => ({
  LoyaltySmsDeviceCard: () => null,
}));
// The members half fetches on mount and pulls in expo-router; this test is
// about the programme editor on the other tab.
jest.mock("../components/loyalty/LoyaltyMembersPanel", () => ({
  LoyaltyMembersPanel: () => null,
}));
jest.mock("../components/ScreenHeader", () => ({ ScreenHeader: () => null }));
jest.mock("../components/LoadingState", () => ({ LoadingState: () => null }));
jest.mock("../components/EmptyState", () => ({ EmptyState: () => null }));
jest.mock("../components/ErrorState", () => ({ ErrorState: () => null }));
jest.mock("../lib/loyalty/repo", () => ({
  fetchLoyaltyPrograms: jest.fn(),
  reviseLoyaltyProgram: jest.fn(),
  createLoyaltyProgram: jest.fn(),
  setLoyaltyProgramStatus: jest.fn(),
}));
it("edits an existing reward into a selected free item and preserves its earning rules", async () => {
  (fetchLoyaltyPrograms as jest.Mock).mockResolvedValue({
    ok: true,
    programs: [
      {
        id: "p",
        name: "Coffee",
        earnMode: "stamp",
        scope: "business",
        status: "active",
        versionNumber: 2,
        rules: {
          earnMode: "stamp",
          threshold: 12,
          pointsPerPeso: null,
          minSpend: 100,
          reward: { type: "fixed", amount: 50 },
          rewardExpiryDays: 30,
          isExclusive: true,
        },
        members: 2,
        rewardsOutstanding: 1,
      },
    ],
    flags: { isEnabled: true, isShadow: false },
  });
  (reviseLoyaltyProgram as jest.Mock).mockResolvedValue({ ok: true });
  render(<LoyaltyScreen />);
  // Members is the screen's first half; the programme editor lives behind the
  // second. Pinned here so a swap of the default tab cannot silently hide it.
  fireEvent.press(
    await screen.findByText("Programmes", { includeHiddenElements: true }),
  );
  fireEvent.press(
    await screen.findByText("Edit reward & rules", {
      includeHiddenElements: true,
    }),
  );
  fireEvent.press(
    screen.getByText("Free item", { includeHiddenElements: true }),
  );
  fireEvent.press(
    await screen.findByText("Latte", { includeHiddenElements: true }),
  );
  expect(screen.queryByText("Presell", { includeHiddenElements: true })).toBeNull();
  fireEvent.press(
    screen.getByText("Save new rules", { includeHiddenElements: true }),
  );
  await waitFor(() =>
    expect(reviseLoyaltyProgram).toHaveBeenCalledWith(
      "tenant",
      "p",
      expect.objectContaining({
        threshold: 12,
        minSpend: 100,
        rewardExpiryDays: 30,
        reward: { type: "free_item", menuItemId: "latte", itemName: "Latte" },
      }),
      2,
    ),
  );
});
