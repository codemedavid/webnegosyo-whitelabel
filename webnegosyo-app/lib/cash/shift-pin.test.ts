jest.mock("../supabase", () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://web.test" }));

import { acceptRemittanceByPin, PIN_COPY, readPinAnswer } from "./shift-pin";

describe("readPinAnswer", () => {
  it("relays each answer of the PIN route in its own words", () => {
    expect(readPinAnswer(200, { remittance: {} })).toEqual({ kind: "accepted" });
    expect(readPinAnswer(422, { error: "That PIN didn't work. 2 tries left.", triesLeft: 2 })).toEqual({
      kind: "wrong_pin",
      message: "That PIN didn't work. 2 tries left.",
      triesLeft: 2,
    });
    expect(readPinAnswer(423, { error: "Locked for 15 minutes.", lockedUntil: "2026-10-24T19:00:00Z" })).toMatchObject({ kind: "locked", lockedUntil: "2026-10-24T19:00:00Z" });
    expect(readPinAnswer(412, { error: "No PIN set — send to their phone instead" })).toMatchObject({ kind: "no_pin" });
    expect(readPinAnswer(409, {})).toMatchObject({ kind: "not_pending" });
    expect(readPinAnswer(500, null)).toEqual({ kind: "failed", message: PIN_COPY.failed });
  });
});

describe("acceptRemittanceByPin", () => {
  it("posts the receiver, PIN and amount as the signed-in cashier", async () => {
    const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = [];
    const outcome = await acceptRemittanceByPin(
      { remittanceId: "r1", receiverUserId: "u-maria", pin: "1234", receivedCents: 634500 },
      {
        token: async () => "tok",
        fetcher: async (url, init) => {
          calls.push({ url, init });
          return { status: 200, json: async () => ({ remittance: {} }) };
        },
      },
    );
    expect(outcome).toEqual({ kind: "accepted" });
    expect(calls[0].url).toBe("https://web.test/api/cash/remittances/r1/accept-pin");
    expect(calls[0].init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(calls[0].init.body)).toEqual({ receiverUserId: "u-maria", pin: "1234", receivedCents: 634500 });
  });

  it("asks to sign in again without a session, and never throws on a dead network", async () => {
    expect(await acceptRemittanceByPin({ remittanceId: "r1", receiverUserId: "u", pin: "1", receivedCents: 1 }, { token: async () => null })).toEqual({
      kind: "failed",
      message: PIN_COPY.noSession,
    });
    const failed = await acceptRemittanceByPin(
      { remittanceId: "r1", receiverUserId: "u", pin: "1", receivedCents: 1 },
      { token: async () => "tok", fetcher: async () => Promise.reject(new Error("offline")) },
    );
    expect(failed).toEqual({ kind: "failed", message: PIN_COPY.failed });
  });
});
