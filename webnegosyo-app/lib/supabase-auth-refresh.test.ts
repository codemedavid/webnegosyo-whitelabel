import {
  autoRefreshActionFor,
  bindAutoRefreshToAppState,
} from "./supabase-auth-refresh";

/**
 * Why the app tells Supabase when to refresh tokens.
 *
 * `autoRefreshToken` runs on a timer. Left alone it keeps ticking after iOS
 * has suspended the app's network, so a refresh fires, its request never gets
 * a response, and it never completes. GoTrue holds its storage lock for the
 * whole of that call and chains every later `getSession()` behind it — so from
 * the moment the register is backgrounded mid-refresh, EVERY authenticated
 * call in the app waits forever. Force-quitting is the only cure, which is
 * exactly what cashiers were doing to get a second sale through.
 *
 * Supabase's own React Native guidance is to stop the timer while the app is
 * away and start it again on return. This module is that rule, made testable.
 */

describe("autoRefreshActionFor", () => {
  test("refreshes while the app is in the foreground", () => {
    expect(autoRefreshActionFor("active")).toBe("start");
  });

  test("stops refreshing once the app is backgrounded", () => {
    // A refresh started here is the one that never comes back.
    expect(autoRefreshActionFor("background")).toBe("stop");
  });

  test("stops refreshing while the app is inactive", () => {
    // iOS "inactive" covers the app switcher and an incoming call — the
    // network is already unreliable there.
    expect(autoRefreshActionFor("inactive")).toBe("stop");
  });
});

describe("bindAutoRefreshToAppState", () => {
  const makeAuth = () => ({
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  });

  test("starts refreshing immediately for an app that is already foreground", () => {
    // Arrange
    const auth = makeAuth();

    // Act
    bindAutoRefreshToAppState({ addEventListener: jest.fn() }, auth, "active");

    // Assert
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
  });

  test("stops refreshing when the app goes to the background", () => {
    // Arrange
    const auth = makeAuth();
    let listener: ((state: string) => void) | undefined;
    const appState = {
      addEventListener: jest.fn((_event: string, handler: (s: string) => void) => {
        listener = handler;
      }),
    };
    bindAutoRefreshToAppState(appState, auth, "active");

    // Act
    listener?.("background");

    // Assert
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  test("resumes refreshing when the app comes back", () => {
    // Arrange
    const auth = makeAuth();
    let listener: ((state: string) => void) | undefined;
    bindAutoRefreshToAppState(
      {
        addEventListener: jest.fn((_e: string, handler: (s: string) => void) => {
          listener = handler;
        }),
      },
      auth,
      "active",
    );
    auth.startAutoRefresh.mockClear();

    // Act
    listener?.("background");
    listener?.("active");

    // Assert
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
  });

  test("subscribes to the change event", () => {
    // Arrange
    const appState = { addEventListener: jest.fn() };

    // Act
    bindAutoRefreshToAppState(appState, makeAuth(), "active");

    // Assert
    expect(appState.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  test("never throws when the platform has no auth client to drive", () => {
    // The client is constructed at module load; a binder that throws would
    // take the whole app down before the login screen renders.
    expect(() =>
      bindAutoRefreshToAppState({ addEventListener: jest.fn() }, null, "active"),
    ).not.toThrow();
  });
});
