import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import LoyaltyScreen from "../app/(main)/loyalty";
import {
  createLoyaltyProgram,
  fetchLoyaltyPrograms,
  reviseLoyaltyProgram,
  setLoyaltyProgramStatus,
} from "../lib/loyalty/repo";
jest.mock("../stores/auth-store", () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ tenantId: "tenant", tenantSlug: "shop" }),
}));
jest.mock("../lib/use-outlets", () => ({
  useOutlets: () => ({ outlets: [], error: null }),
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});
jest.mock("../lib/products", () => ({
  listProducts: async () => [
    { id: "latte", name: "Latte", is_available: true, image_url: "https://img/latte.jpg" },
    { id: "presell", name: "Presell", is_available: true, presell_enabled: true },
  ],
}));
jest.mock("../lib/web-app-url", () => ({
  getWebAppUrl: () => "https://shop.test",
}));
jest.mock("../components/loyalty/WalletVerificationCard", () => ({ WalletVerificationCard: () => null }));
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
const hidden = { includeHiddenElements: true } as const;

const EXISTING = {
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
};

async function openProgrammes() {
  render(<LoyaltyScreen />);
  // Members is the screen's first half; the programme editor lives behind the
  // second. Pinned here so a swap of the default tab cannot silently hide it.
  fireEvent.press(await screen.findByText("Programmes", hidden));
}

function putFreeLatteOn(slotLabel: RegExp) {
  fireEvent.press(screen.getByLabelText(slotLabel, hidden));
  fireEvent.press(screen.getByText("Free item", hidden));
  fireEvent.press(screen.getByLabelText("Latte", hidden));
  fireEvent.press(screen.getByText("Put it on the card", hidden));
}

it("edits a card into a reward ladder and preserves its earning rules", async () => {
  (fetchLoyaltyPrograms as jest.Mock).mockResolvedValue({ ok: true, programs: [EXISTING], flags: { isEnabled: true, isShadow: false } });
  (reviseLoyaltyProgram as jest.Mock).mockResolvedValue({ ok: true });
  await openProgrammes();

  fireEvent.press(await screen.findByText("✏️ Edit card", hidden));
  fireEvent.press(screen.getByText("Continue", hidden)); // size → rewards
  await waitFor(() => expect(screen.getByLabelText(/^Stamp 12: /, hidden)).toBeTruthy());

  putFreeLatteOn(/^Stamp 12: /);
  expect(screen.queryByLabelText("Presell", hidden)).toBeNull();

  fireEvent.press(screen.getByLabelText("Stamp 6: add a reward here", hidden));
  fireEvent.press(screen.getByText("₱ off", hidden));
  fireEvent.changeText(screen.getByLabelText("Amount off in pesos", hidden), "20");
  fireEvent.press(screen.getByLabelText("Icon 🥤", hidden));
  fireEvent.press(screen.getByText("Put it on the card", hidden));

  fireEvent.press(screen.getByText("Continue", hidden)); // rewards → details
  fireEvent.press(screen.getByText("Continue", hidden)); // details → review
  fireEvent.press(screen.getByText("Save new rules", hidden));

  await waitFor(() =>
    expect(reviseLoyaltyProgram).toHaveBeenCalledWith(
      "tenant",
      "p",
      expect.objectContaining({
        threshold: 12,
        minSpend: 100,
        rewardExpiryDays: 30,
        reward: { type: "free_item", menuItemId: "latte", itemName: "Latte", imageUrl: "https://img/latte.jpg" },
        milestones: [{ at: 6, reward: { type: "fixed", amount: 20, emoji: "🥤" } }],
      }),
      2,
    ),
  );
  expect(await screen.findByText("Card updated!", hidden)).toBeTruthy();
});

it("will not leave the rewards step while a reward is unfinished", async () => {
  (fetchLoyaltyPrograms as jest.Mock).mockResolvedValue({ ok: true, programs: [], flags: { isEnabled: false, isShadow: true } });
  await openProgrammes();

  fireEvent.press(await screen.findByText("＋ Create a reward card", hidden));
  fireEvent.press(screen.getByLabelText(/^Reward ladder:/, hidden));
  fireEvent.press(screen.getByText("Continue", hidden)); // size → rewards
  fireEvent.press(screen.getByText("Continue", hidden));

  expect(screen.getByText(/Big reward: Choose the free menu item/, hidden)).toBeTruthy();
  expect(createLoyaltyProgram).not.toHaveBeenCalled();
});

it("builds a ladder from a template and launches it in one go", async () => {
  (fetchLoyaltyPrograms as jest.Mock).mockResolvedValue({ ok: true, programs: [], flags: { isEnabled: false, isShadow: true } });
  (createLoyaltyProgram as jest.Mock).mockResolvedValue({ ok: true, programId: "new" });
  (setLoyaltyProgramStatus as jest.Mock).mockResolvedValue({ ok: true });
  await openProgrammes();

  fireEvent.press(await screen.findByText("＋ Create a reward card", hidden));
  fireEvent.press(screen.getByLabelText(/^Reward ladder:/, hidden));
  fireEvent.press(screen.getByText("Continue", hidden)); // size → rewards
  await waitFor(() => expect(screen.getByLabelText(/^Stamp 5: /, hidden)).toBeTruthy());
  putFreeLatteOn(/^Stamp 5: /);
  putFreeLatteOn(/^Stamp 10: /);
  fireEvent.press(screen.getByText("Continue", hidden)); // rewards → details
  fireEvent.press(screen.getByText("Continue", hidden)); // details → review
  fireEvent.press(screen.getByText("Launch card 🚀", hidden));

  await waitFor(() => expect(setLoyaltyProgramStatus).toHaveBeenCalledWith("tenant", "new", "active"));
  expect(createLoyaltyProgram).toHaveBeenCalledWith("tenant", expect.objectContaining({
    name: "Rewards Club",
    rules: expect.objectContaining({
      threshold: 10,
      reward: expect.objectContaining({ type: "free_item", menuItemId: "latte", emoji: "🍔" }),
      milestones: [{ at: 5, reward: expect.objectContaining({ type: "free_item", menuItemId: "latte", emoji: "🥤" }) }],
    }),
  }));
  expect(await screen.findByText("Your card is live!", hidden)).toBeTruthy();
});
