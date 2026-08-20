/**
 * The tender screen (app/(main)/pos-tender.tsx) is a hidden TAB screen, so it
 * mounts once and then lives forever. Anything "per sale" that is minted at
 * mount time is actually per app-launch: after the first completed sale the
 * screen came back with `isCompleting` still true (a spinner where the swipe
 * button should be — the register froze until the app was killed) and with the
 * first sale's idempotency key (a second sale would dedupe into the first).
 *
 * This module is the pure definition of "a fresh sale at the tender screen";
 * the screen applies it on every focus.
 */
import { freshTenderSession, newClientOrderId } from "./pos-tender-session";

describe("newClientOrderId", () => {
  test("carries the pos- prefix the backend keys counter sales on", () => {
    // Act
    const id = newClientOrderId();

    // Assert
    expect(id).toMatch(/^pos-[a-z0-9]+$/);
  });

  test("two consecutive sales never share an idempotency key", () => {
    // Arrange / Act
    const ids = new Set(Array.from({ length: 200 }, () => newClientOrderId()));

    // Assert — a reused key makes createOrder return the FIRST order and the
    // second sale silently vanishes.
    expect(ids.size).toBe(200);
  });
});

describe("freshTenderSession", () => {
  test("a new sale is not stuck completing the previous one", () => {
    // Act
    const session = freshTenderSession();

    // Assert — a carried-over true here renders the footer spinner instead of
    // the swipe control, which is the "second checkout just loads" freeze.
    expect(session.isCompleting).toBe(false);
  });

  test("clears the previous sale's tender inputs", () => {
    // Act
    const session = freshTenderSession();

    // Assert — a stale reference or proof would attach the last customer's
    // payment evidence to the next customer's order.
    expect(session.tenderedText).toBe("");
    expect(session.reference).toBe("");
    expect(session.proof).toBeNull();
    expect(session.editReason).toBe("");
  });

  test("mints a fresh idempotency key per session", () => {
    // Act
    const first = freshTenderSession();
    const second = freshTenderSession();

    // Assert
    expect(second.clientOrderId).not.toBe(first.clientOrderId);
    expect(second.clientOrderId).toMatch(/^pos-/);
  });
});
