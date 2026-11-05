/**
 * Switching a dish on or off goes through the web app's
 * `POST /api/inventory/dish-availability`, never a direct row write.
 *
 * Turning a dish back ON while its recipe can't be made is a question, not a
 * silent flip: the route answers `needs_confirmation` with what is short, and
 * the owner chooses "Record a count", "Sell anyway until <time>" or Cancel.
 * Every failure is an error with words a merchant can act on — the switch must
 * never be left showing a state the server did not save.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://shop.test" } } },
}));
const mockToken = jest.fn();
jest.mock("./authorized-post", () => ({
  getAccessTokenBounded: (...args: unknown[]) => mockToken(...args),
}));

import {
  describeDishAvailabilityBlockers,
  findIngredientIdByName,
  parseDishAvailabilityResponse,
  setDishAvailability,
} from "./dish-availability";

const okJson = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  mockToken.mockReset().mockResolvedValue("tok-1");
});

describe("setDishAvailability", () => {
  it("posts the switch to the web route as the signed-in merchant", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      okJson({ status: "saved", isAvailable: false, snoozedUntil: null }),
    );

    const result = await setDishAvailability({ menuItemId: "m1", isAvailable: false }, { fetchImpl });

    expect(result).toEqual({ status: "saved", isAvailable: false, snoozedUntil: null });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://shop.test/api/inventory/dish-availability");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(String(init.body))).toEqual({ menuItemId: "m1", isAvailable: false });
  });

  it("sends sellAnyway only when the owner chose it", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      okJson({ status: "saved", isAvailable: true, snoozedUntil: "2026-11-03T15:59:00.000Z" }),
    );

    await setDishAvailability({ menuItemId: "m1", isAvailable: true, sellAnyway: true }, { fetchImpl });

    expect(JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body))).toEqual({
      menuItemId: "m1",
      isAvailable: true,
      sellAnyway: true,
    });
  });

  it("hands back the route's question when a re-enable can't be made", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      okJson({
        status: "needs_confirmation",
        blockers: [{ name: "Mozzarella", onHand: 0, unit: "g" }],
        sellAnywayUntil: "2026-11-03T15:59:00.000Z",
      }),
    );

    const result = await setDishAvailability({ menuItemId: "m1", isAvailable: true }, { fetchImpl });

    expect(result).toEqual({
      status: "needs_confirmation",
      blockers: [{ name: "Mozzarella", onHand: 0, unit: "g" }],
      sellAnywayUntil: "2026-11-03T15:59:00.000Z",
    });
  });

  it("throws the route's own error message on a refusal", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okJson({ error: "You need the menu permission." }, 403));

    await expect(
      setDishAvailability({ menuItemId: "m1", isAvailable: true }, { fetchImpl }),
    ).rejects.toThrow("You need the menu permission.");
  });

  it("throws a plain message when the server answers without one", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("html"); } });

    await expect(
      setDishAvailability({ menuItemId: "m1", isAvailable: true }, { fetchImpl }),
    ).rejects.toThrow(/couldn't save|try again/i);
  });

  it("throws a connection message when the network fails", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("Network request failed"));

    await expect(
      setDishAvailability({ menuItemId: "m1", isAvailable: false }, { fetchImpl }),
    ).rejects.toThrow(/connection/i);
  });

  it("refuses to guess without a session", async () => {
    mockToken.mockResolvedValue(null);
    const fetchImpl = jest.fn();

    await expect(
      setDishAvailability({ menuItemId: "m1", isAvailable: false }, { fetchImpl }),
    ).rejects.toThrow(/sign in/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats an answer it cannot read as a failure, not a save", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okJson({ status: "maybe" }));

    await expect(
      setDishAvailability({ menuItemId: "m1", isAvailable: false }, { fetchImpl }),
    ).rejects.toThrow(/update the app|try again/i);
  });

  it("gives up on a hung request instead of leaving the switch spinning", async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn().mockReturnValue(new Promise(() => {}));
    const pending = setDishAvailability({ menuItemId: "m1", isAvailable: false }, { fetchImpl, timeoutMs: 50 });
    const assertion = expect(pending).rejects.toThrow(/taking too long|connection/i);
    await jest.advanceTimersByTimeAsync(60);
    await assertion;
    jest.useRealTimers();
  });
});

describe("parseDishAvailabilityResponse", () => {
  it("keeps an ingredient id when the route sends one", () => {
    expect(
      parseDishAvailabilityResponse({
        status: "needs_confirmation",
        blockers: [{ name: "Basil", onHand: 0, unit: "g", inventoryItemId: "inv-1" }],
        sellAnywayUntil: "2026-11-03T15:59:00.000Z",
      }),
    ).toEqual({
      status: "needs_confirmation",
      blockers: [{ name: "Basil", onHand: 0, unit: "g", inventoryItemId: "inv-1" }],
      sellAnywayUntil: "2026-11-03T15:59:00.000Z",
    });
  });

  it("drops malformed blockers and refuses a question with none left", () => {
    expect(
      parseDishAvailabilityResponse({
        status: "needs_confirmation",
        blockers: [{ name: 3 }],
        sellAnywayUntil: "2026-11-03T15:59:00.000Z",
      }),
    ).toBeNull();
  });
});

describe("describeDishAvailabilityBlockers", () => {
  it("leads with the first short ingredient and its count", () => {
    const copy = describeDishAvailabilityBlockers("Margherita", [{ name: "Mozzarella", onHand: 0, unit: "g" }]);
    expect(copy.title).toBe("Mozzarella shows 0 g");
    expect(copy.message).toContain("Margherita");
  });

  it("counts the rest when several are short", () => {
    const copy = describeDishAvailabilityBlockers("Pizza", [
      { name: "Mozzarella", onHand: 0, unit: "g" },
      { name: "Basil", onHand: 0.5, unit: "g" },
      { name: "Dough", onHand: 0, unit: "pc" },
    ]);
    expect(copy.title).toBe("Mozzarella shows 0 g");
    expect(copy.message).toMatch(/Basil \(0\.5 g\).*Dough \(0 pc\)/);
  });
});

describe("findIngredientIdByName", () => {
  const index = [
    { id: "inv-1", name: "Mozzarella", is_active: false },
    { id: "inv-2", name: "mozzarella ", is_active: true },
    { id: "inv-3", name: "Basil", is_active: true },
    { id: "inv-4", name: "Tomato", is_active: true },
    { id: "inv-5", name: "tomato", is_active: true },
  ];

  it("finds the ingredient by its name, ignoring case and spacing, preferring a live one", () => {
    expect(findIngredientIdByName(index, "MOZZARELLA")).toBe("inv-2");
    expect(findIngredientIdByName(index, "Basil")).toBe("inv-3");
  });

  it("refuses to guess between two live ingredients of the same name", () => {
    expect(findIngredientIdByName(index, "Tomato")).toBeNull();
  });

  it("is null for a name it does not know", () => {
    expect(findIngredientIdByName(index, "Saffron")).toBeNull();
  });
});
