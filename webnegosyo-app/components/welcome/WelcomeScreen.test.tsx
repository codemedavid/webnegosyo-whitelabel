/**
 * The signed-out welcome: three result screens that play on their own, then
 * Log in or the demo — never a sign-up (Apple 3.1.1).
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetAuth = jest.fn();
let mockIsFocused = true;

jest.mock("expo-router", () => ({
  router: { push: (href: string) => mockPush(href), replace: (href: string) => mockReplace(href) },
}));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockIsFocused }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../stores/auth-store", () => ({
  useAuthStore: (select: (s: { setAuth: (data: unknown) => void }) => unknown) =>
    select({ setAuth: (data: unknown) => mockSetAuth(data) }),
}));

import { WelcomeScreen } from "./WelcomeScreen";
import { WELCOME_AUTOPLAY_MS, WELCOME_SLIDES } from "../../lib/welcome/slides";

const headline = (i: number) => WELCOME_SLIDES[i].headline;

function mockReduceMotion(enabled: boolean) {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(enabled);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockReset();
  mockReplace.mockReset();
  mockSetAuth.mockReset();
  mockIsFocused = true;
  mockReduceMotion(false);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("opens on the first result, and the screens play on their own", async () => {
  render(<WelcomeScreen />);
  expect(screen.getByText(headline(0))).toBeTruthy();

  await act(async () => {
    jest.advanceTimersByTime(WELCOME_AUTOPLAY_MS);
  });
  expect(screen.getByText(headline(1))).toBeTruthy();

  await act(async () => {
    jest.advanceTimersByTime(WELCOME_AUTOPLAY_MS);
  });
  expect(screen.getByText(headline(2))).toBeTruthy();

  await act(async () => {
    jest.advanceTimersByTime(WELCOME_AUTOPLAY_MS);
  });
  expect(screen.getByText(headline(0))).toBeTruthy();
});

test("holds still while Log in is open on top of it", async () => {
  mockIsFocused = false;
  render(<WelcomeScreen />);
  await act(async () => {
    jest.advanceTimersByTime(WELCOME_AUTOPLAY_MS * 2);
  });
  expect(screen.getByText(headline(0))).toBeTruthy();
});

test("a dot jumps straight to its screen", async () => {
  render(<WelcomeScreen />);
  fireEvent.press(screen.getByLabelText("Show screen 3 of 3"));
  expect(screen.getByText(headline(2))).toBeTruthy();
});

test("Log in opens the sign-in screen on top, so Back returns here", () => {
  render(<WelcomeScreen />);
  fireEvent.press(screen.getByText("Log in"));
  expect(mockPush).toHaveBeenCalledWith("/(auth)/login");
});

test("the demo link opens the read-only demo store", () => {
  render(<WelcomeScreen />);
  fireEvent.press(screen.getByText("Explore the demo store"));
  expect(mockSetAuth).toHaveBeenCalledWith(expect.objectContaining({ isDemo: true, userId: null }));
  expect(mockReplace).toHaveBeenCalledWith("/(main)/dashboard");
});

test("with Reduce Motion on, the screen holds still until the merchant moves it", async () => {
  mockReduceMotion(true);
  render(<WelcomeScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    jest.advanceTimersByTime(WELCOME_AUTOPLAY_MS * 2);
  });
  expect(screen.getByText(headline(0))).toBeTruthy();
});

test("with a screen reader on, the words never change under the reader", async () => {
  jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
  render(<WelcomeScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    jest.advanceTimersByTime(WELCOME_AUTOPLAY_MS * 2);
  });
  expect(screen.getByText(headline(0))).toBeTruthy();
});

test("offers no way to register a business", () => {
  render(<WelcomeScreen />);
  expect(screen.queryByText(/sign ?up|create your store|register/i)).toBeNull();
});
