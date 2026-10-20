import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TextsScreen from "../../app/(main)/texts";
import { automationsApi, type Automation, type AutomationsView, type RecipeInfo } from "../../lib/sms-automations/api";

jest.mock("../../stores/auth-store", () => {
  const state = { tenantId: "tenant-1", tenantSlug: "kape", tenantName: "Kape", isDemo: false, isOwner: true };
  const useAuthStore = (select: (s: typeof state) => unknown) => select(state);
  useAuthStore.getState = () => state;
  return { useAuthStore };
});
jest.mock("../../lib/use-tab-visibility-context", () => ({
  useTabVisibilityContext: () => ({
    caller: { role: "admin", isOwner: true, permissions: null },
    audience: { accountScope: { kind: "all" }, activeOutletCount: 1, isDemo: false },
    takesAdvanceOrders: false,
  }),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../ScreenHeader", () => ({
  ScreenHeader: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
jest.mock("../LoadingState", () => ({ LoadingState: () => null }));
jest.mock("../LoyaltySmsDeviceCard", () => ({ LoyaltySmsDeviceCard: () => null, useCanEnrollSmsDevice: () => false }));
jest.mock("../../lib/sms-automations/api", () => ({
  automationsApi: {
    list: jest.fn(),
    preview: jest.fn(),
    setStatus: jest.fn(),
    runNow: jest.fn(),
    activity: jest.fn(),
  },
}));

const api = automationsApi as jest.Mocked<typeof automationsApi>;
const hidden = { includeHiddenElements: true } as const;

const recipe = (id: RecipeInfo["id"], overrides: Partial<RecipeInfo> = {}): RecipeInfo => ({
  id, moment: "bring_back", title: id, pitch: `${id} pitch`, defaults: {}, limits: {}, defaultReentryDays: 60,
  needsLoyalty: false, needsReviewLink: false, defaultMessage: "Hi {{firstName}}", defaultMessageTl: "Hi", variables: ["firstName"],
  description: "d", ...overrides,
});

const automation = (overrides: Partial<Automation> = {}): Automation => ({
  id: "a-win", recipe: "win_back", name: "We miss you", description: "Text guests who haven’t ordered in 30 days",
  params: { inactiveDays: 30 }, messageTemplate: "Hi {{firstName}}", runMode: "auto", reentryDays: null, status: "on",
  source: "owner", updatedAt: "", stats: { waiting: 0, sent30d: 12, skipped30d: 0, cameBack30d: 0, lastSentAt: null }, ...overrides,
});

function viewWith(automations: Automation[]): AutomationsView {
  return {
    automations,
    recipes: [recipe("win_back"), recipe("review_request", { needsReviewLink: true })],
    settings: { quietHoursStart: "21:00", quietHoursEnd: "08:00", guestCapDays: 3, dailyLimit: 100, optOutLine: null, reviewUrl: null },
    sender: { enrolled: 1, online: true, lastSeenAt: null },
    outlook: { waiting: 0, sentToday: 2, dailyLimit: 100, finishAt: null },
    loyaltyOn: true,
  };
}

function renderHub(view: AutomationsView) {
  api.list.mockResolvedValue({ ok: true, value: view });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TextsScreen />
    </QueryClientProvider>,
  );
}

// The first render pulls the whole screen's module graph through babel.
jest.setTimeout(60_000);

beforeEach(() => jest.clearAllMocks());

describe("Texts hub", () => {
  it("shows each automation with what it did", async () => {
    renderHub(viewWith([automation()]));

    expect(await screen.findByText("On · 12 sent in 30 days", hidden)).toBeTruthy();
    expect(screen.getByText("Phone online · 2 sent today", hidden)).toBeTruthy();
  });

  it("asks before turning on, with how many guests already qualify", async () => {
    api.preview.mockResolvedValue({
      ok: true,
      value: {
        audience: { withPhone: 40, textable: 30 },
        now: { qualifying: 14, queued: 12, skipped: { no_consent: 2 }, sample: ["Maria"] },
        justQualified: 0,
        sampleText: null,
        outlook: { waiting: 0, sentToday: 2, dailyLimit: 100, finishAt: null },
      },
    });
    api.setStatus.mockResolvedValue({ ok: true, value: { status: "on", backlog: null } });
    renderHub(viewWith([automation({ status: "off" })]));

    fireEvent(await screen.findByTestId("automation-switch-win_back", hidden), "valueChange", true);

    expect(await screen.findByText("12 guests already qualify", hidden)).toBeTruthy();
    expect(api.preview).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ recipe: "win_back" }));
    fireEvent.press(screen.getByText("Turn on and text 12 now", hidden));
    await waitFor(() => expect(api.setStatus).toHaveBeenCalledWith("tenant-1", "a-win", "on", true));
  });

  it("shows a blocked recipe's fix instead of calling the API", async () => {
    renderHub(viewWith([automation({ id: "a-rev", recipe: "review_request", name: "Review request", status: "off" })]));

    fireEvent(await screen.findByTestId("automation-switch-review_request", hidden), "valueChange", true);

    expect(await screen.findByText("Add your review link", hidden)).toBeTruthy();
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.setStatus).not.toHaveBeenCalled();
  });

  it("leads a store with no automations with recipes to start from", async () => {
    renderHub(viewWith([]));

    expect(await screen.findByText("Start with one of these", hidden)).toBeTruthy();
    expect(screen.getByText("win_back pitch", hidden)).toBeTruthy();
  });
});
