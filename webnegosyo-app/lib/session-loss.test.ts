import { bindSessionLossToAuth, type SessionLossDeps } from "./session-loss";
import { signOutThisDevice } from "./sign-out";

/**
 * Gungjeon Central, 2026-10-04: a staff password reset revoked every session
 * on the branch account. supabase-js dropped the iPad's session and emitted
 * SIGNED_OUT, but the app's auth store still said "signed in" — so the order
 * screens kept polling as the anonymous role. RLS answered every read with
 * zero rows and no error (the queue looked quiet while orders were arriving)
 * and refused every counter sale with a 401, for over an hour.
 */

type Listener = (event: string) => void;

function harness(overrides: Partial<SessionLossDeps> = {}) {
  let listener: Listener = () => undefined;
  const deps: SessionLossDeps = {
    onAuthStateChange: (callback) => {
      listener = callback;
    },
    isSignedInHere: () => true,
    signOutLocally: jest.fn(),
    tellStaff: jest.fn(),
    onSignedIn: jest.fn(),
    ...overrides,
  };
  bindSessionLossToAuth(deps);
  return { deps, emit: (event: string) => listener(event) };
}

describe("bindSessionLossToAuth", () => {
  test("a session the server ended sends the device back to sign-in and says why", () => {
    const { deps, emit } = harness();

    emit("SIGNED_OUT");

    expect(deps.signOutLocally).toHaveBeenCalledTimes(1);
    expect(deps.tellStaff).toHaveBeenCalledTimes(1);
  });

  test("a deliberate sign-out is not reported as a lost session", async () => {
    let listener: Listener = () => undefined;
    const deps: SessionLossDeps = {
      onAuthStateChange: (callback) => {
        listener = callback;
      },
      isSignedInHere: () => true,
      signOutLocally: jest.fn(),
      tellStaff: jest.fn(),
      onSignedIn: jest.fn(),
    };
    bindSessionLossToAuth(deps);
    // GoTrue emits SIGNED_OUT from inside signOut(), before the screen that
    // called it clears the store — exactly when the store still says signed in.
    const signOut = jest.fn(async () => {
      listener("SIGNED_OUT");
      return { error: null };
    });

    await signOutThisDevice({ auth: { signOut } });

    expect(deps.signOutLocally).not.toHaveBeenCalled();
    expect(deps.tellStaff).not.toHaveBeenCalled();
  });

  test("a failed deliberate sign-out does not leave later losses silenced", async () => {
    const { deps, emit } = harness();
    const signOut = jest.fn().mockRejectedValue(new Error("offline"));

    await expect(signOutThisDevice({ auth: { signOut } })).rejects.toThrow("offline");
    emit("SIGNED_OUT");

    expect(deps.signOutLocally).toHaveBeenCalledTimes(1);
  });

  test("nothing happens when this device was not signed in (login screen, demo mode)", () => {
    const { deps, emit } = harness({ isSignedInHere: () => false });

    emit("SIGNED_OUT");

    expect(deps.signOutLocally).not.toHaveBeenCalled();
    expect(deps.tellStaff).not.toHaveBeenCalled();
  });

  test.each(["TOKEN_REFRESHED", "INITIAL_SESSION", "USER_UPDATED", "PASSWORD_RECOVERY"])(
    "%s is not a lost session",
    (event) => {
      const { deps, emit } = harness();

      emit(event);

      expect(deps.signOutLocally).not.toHaveBeenCalled();
    },
  );

  test("signing in again hands the sales a dead session parked back to the outbox", () => {
    const { deps, emit } = harness();

    emit("SIGNED_IN");

    expect(deps.onSignedIn).toHaveBeenCalledTimes(1);
    expect(deps.signOutLocally).not.toHaveBeenCalled();
  });
});
