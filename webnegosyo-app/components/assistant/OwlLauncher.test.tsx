/**
 * The owl introduces itself: a bubble says what Owl can do on this screen,
 * tapping it opens Owl already asking that question, and the cross (or a few
 * opens) retires the tips for good.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockSegments = { current: ["(main)", "inventory"] as string[] };
const mockSend = jest.fn();

jest.mock("expo-router", () => ({ useSegments: () => mockSegments.current, router: { push: jest.fn() } }));
jest.mock("../../lib/authorized-post", () => ({ getAccessTokenBounded: async () => "user-token" }));
jest.mock("../../lib/web-app-url", () => ({ getWebAppUrl: () => "https://web.test" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../lib/assistant/use-assistant-chat", () => ({
  useAssistantChat: () => ({ messages: [], status: "ready", error: null, isBusy: false, send: mockSend, stop: jest.fn(), startOver: jest.fn(), reopen: jest.fn() }),
}));
jest.mock("../../stores/auth-store", () => {
  const state = { isAuthenticated: true, isDemo: false, tenantId: "t-1", tenantSlug: "seacook", assistantEnabled: true, outletId: null };
  return { useAuthStore: (select: (s: typeof state) => unknown) => select(state) };
});

import { OwlLauncher } from "./OwlLauncher";

const STORAGE_KEY = "assistant.owlHints";

beforeEach(() => {
  mockSend.mockReset();
  mockSegments.current = ["(main)", "inventory"];
});

test("the owl says what it can do on this screen, and the tap asks it", async () => {
  render(<OwlLauncher bottomOffset={60} />);

  const bubble = await screen.findByLabelText("I can watch your stock. Ask Owl: What stock is running low?");
  fireEvent.press(bubble);

  await waitFor(() => expect(mockSend).toHaveBeenCalledWith("What stock is running low?"));
  expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "{}").opens).toBe(1);
});

test("hiding the tips is remembered", async () => {
  // A screen not shown yet this app session (each screen's tip shows once per launch).
  mockSegments.current = ["(main)", "customers"];
  render(<OwlLauncher bottomOffset={60} />);

  fireEvent.press(await screen.findByLabelText("Hide Owl tips"));

  expect(screen.queryByLabelText("Hide Owl tips")).toBeNull();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "{}").isDismissed).toBe(true));
  expect(mockSend).not.toHaveBeenCalled();
});

test("an owner who already knows Owl sees no bubble", async () => {
  mockSegments.current = ["(main)", "team"];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ opens: 3, isDismissed: false }));
  render(<OwlLauncher bottomOffset={60} />);

  await act(async () => {});
  expect(screen.getByLabelText("Ask Owl, your store assistant")).toBeTruthy();
  expect(screen.queryByLabelText("Hide Owl tips")).toBeNull();
});

test("no bubble where the owl itself is hidden", async () => {
  mockSegments.current = ["(main)", "pos"];
  render(<OwlLauncher bottomOffset={60} />);

  await act(async () => {});
  expect(screen.queryByLabelText("Hide Owl tips")).toBeNull();
});
