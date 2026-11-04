jest.mock("../authorized-post", () => ({ getAccessTokenBounded: jest.fn() }));
jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://web.test" }));

import { getAccessTokenBounded } from "../authorized-post";
import { fetchReport } from "./client";
import type { ReportQuery } from "./types";

const token = getAccessTokenBounded as jest.MockedFunction<typeof getAccessTokenBounded>;

const QUERY: ReportQuery = {
  tenantId: "aaaaaaaa-0000-4000-8000-000000000001",
  period: { preset: "this_month" },
  compare: "previous",
  branch: null,
  sections: ["summary"],
};

function reply(status: number, body: unknown): typeof fetch {
  return jest.fn(async () => ({ ok: status < 400, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
}

beforeEach(() => token.mockResolvedValue("tok"));

describe("fetchReport", () => {
  it("posts the query with the user's token and returns the payload", async () => {
    const payload = { success: true, context: { period: {} }, metrics: [], sections: {} };
    const fetchImpl = reply(200, payload);
    const result = await fetchReport(QUERY, fetchImpl);
    expect(result).toEqual({ ok: true, payload });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://web.test/api/reports/query",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer tok" }), body: JSON.stringify(QUERY) }),
    );
  });

  it("says signed out when no token can be read, without calling the server", async () => {
    token.mockResolvedValue(null);
    const fetchImpl = reply(200, {});
    expect(await fetchReport(QUERY, fetchImpl)).toMatchObject({ ok: false, reason: "signed_out" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps refusals to plain reasons, keeping the server's permission sentence", async () => {
    expect(await fetchReport(QUERY, reply(403, { error: "Ask the owner." }))).toEqual({ ok: false, reason: "forbidden", message: "Ask the owner." });
    expect(await fetchReport(QUERY, reply(409, { error: "x" }))).toMatchObject({ reason: "unsupported" });
    expect(await fetchReport(QUERY, reply(429, {}))).toMatchObject({ reason: "rate_limited" });
    expect(await fetchReport(QUERY, reply(500, { error: "stack trace" }))).toMatchObject({ reason: "unavailable" });
  });

  it("a malformed answer or a network error is 'unavailable', never a crash", async () => {
    expect(await fetchReport(QUERY, reply(200, { success: true }))).toMatchObject({ ok: false, reason: "unavailable" });
    const broken = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchReport(QUERY, broken)).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
