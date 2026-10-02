jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { webAppUrl: "https://www.webnegosyo.com" } },
  },
}));

const getSessionMock = jest.fn();
jest.mock("./supabase", () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));

import {
  callBoostAi,
  createButtonLabel,
  generateButtonLabel,
  parseBoostAiState,
  quotaLine,
  sortIdeasForDisplay,
  type BoostAiState,
  type BoostIdeaView,
} from "./boost-ai";

const TENANT = "11111111-1111-4111-8111-111111111111";

function idea(id: string, overrides: Partial<BoostIdeaView> = {}): BoostIdeaView {
  return {
    id,
    kind: "combo",
    status: "pending",
    title: "Burger Combo",
    detail: "Burger + Fries + Coke · ₱229, saves ₱21",
    reason: "Fries are in 40% of burger orders.",
    itemNames: ["Burger", "Fries", "Coke"],
    ...overrides,
  };
}

const STATE: BoostAiState = {
  boostEnabled: true,
  quota: { used: 1, limit: 3, left: 2 },
  latest: {
    status: "succeeded",
    summary: "Burgers drive most orders.",
    ordersAnalyzed: 120,
    createdAt: "2026-10-01T00:00:00.000Z",
    error: null,
  },
  proposals: [idea("p1")],
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("parseBoostAiState", () => {
  test("accepts the route's state", () => {
    expect(parseBoostAiState(STATE)).toEqual(STATE);
  });

  test("drops a malformed idea instead of blanking the list", () => {
    const parsed = parseBoostAiState({
      ...STATE,
      proposals: [idea("ok"), { id: "bad", kind: "teleport", status: "pending" }],
    });
    expect(parsed?.proposals.map((p) => p.id)).toEqual(["ok"]);
  });

  test("refuses a body without a quota or a proposal list", () => {
    expect(parseBoostAiState(null)).toBeNull();
    expect(parseBoostAiState({ ...STATE, quota: undefined })).toBeNull();
    expect(parseBoostAiState({ ...STATE, proposals: "nope" })).toBeNull();
  });
});

describe("labels", () => {
  test("the create button says when it also turns Boost Sales on", () => {
    expect(createButtonLabel(true)).toBe("Create it");
    expect(createButtonLabel(false)).toBe("Turn on Boost Sales & create");
  });

  test("the generate button reads as a fresh look once ideas exist", () => {
    expect(generateButtonLabel(undefined)).toBe("Find offer ideas");
    expect(generateButtonLabel({ ...STATE, proposals: [] })).toBe("Find offer ideas");
    expect(generateButtonLabel(STATE)).toBe("Find new ideas");
  });

  test("the quota line counts free runs and reassures once they are spent", () => {
    expect(quotaLine({ used: 1, limit: 3, left: 2 })).toBe("2 of 3 free AI runs left");
    expect(quotaLine({ used: 3, limit: 3, left: 0 })).toBe(
      "All 3 free AI runs used — your ideas below stay available.",
    );
  });
});

describe("sortIdeasForDisplay", () => {
  test("puts ideas still to act on before live ones, keeping the AI's order", () => {
    const sorted = sortIdeasForDisplay([
      idea("live", { status: "applied" }),
      idea("a"),
      idea("b", { status: "approved" }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "live"]);
  });
});

describe("callBoostAi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
  });

  test("posts the op to the web route with the merchant's bearer token", async () => {
    // Arrange
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true, notice: "Created", state: STATE }));

    // Act
    const result = await callBoostAi(
      { tenantId: TENANT, op: "create", proposalId: "p1" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    // Assert
    expect(result).toEqual({ state: STATE, notice: "Created" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://www.webnegosyo.com/api/boost/ai");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body)).toEqual({ tenantId: TENANT, op: "create", proposalId: "p1" });
  });

  test("surfaces the route's own error message", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, error: "You have used all 3 free AI generations for this store." }, 409),
    );
    await expect(
      callBoostAi({ tenantId: TENANT, op: "generate" }, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("You have used all 3 free AI generations for this store.");
  });

  test("refuses without a session instead of calling the route", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchImpl = jest.fn();
    await expect(
      callBoostAi({ tenantId: TENANT, op: "state" }, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/sign in/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("settles with an error when the route never answers", async () => {
    const fetchImpl = jest.fn(() => new Promise<Response>(() => {}));
    await expect(
      callBoostAi(
        { tenantId: TENANT, op: "state" },
        { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 },
      ),
    ).rejects.toThrow(/taking too long/);
  });

  test("refuses a body it cannot render", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true, state: { nope: true } }));
    await expect(
      callBoostAi({ tenantId: TENANT, op: "state" }, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/cannot read/);
  });
});
