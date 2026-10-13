import {
  ACTIVITY_PAGE_SIZE,
  ActivityRepoError,
  fetchActivityPage,
  fetchActivitySummary,
  isActivityUnavailable,
  markActivityReviewed,
  type ActivityRpcClient,
  type RpcResult,
} from "./activity-repo";

const TENANT = "11111111-1111-1111-1111-111111111111";

function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "a1",
    outlet_id: null,
    outlet_name: null,
    occurred_at: "2026-10-12T04:33:00.123456+00:00",
    category: "money",
    kind: "refund.issued",
    is_routine: false,
    actor_user_id: "u1",
    actor_name: "Ana Reyes",
    approved_by_name: null,
    amount: "-185",
    quantity: null,
    unit: null,
    reason: "Wrong item served",
    note: null,
    subject_type: "order",
    subject_ref: "o1",
    order_number: "#14",
    before: null,
    after: null,
    summary: {},
    flags: [],
    reviewed_at: null,
    reviewed_by_name: null,
    ...overrides,
  };
}

function fakeClient(results: RpcResult[]) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: ActivityRpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      const next = results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  };
  return { client, calls };
}

describe("fetchActivityPage", () => {
  it("sends the contract's parameter names and the default page size", async () => {
    // Arrange
    const { client, calls } = fakeClient([{ data: [], error: null }]);

    // Act
    await fetchActivityPage(client, {
      tenantId: TENANT,
      categories: ["money", "cash"],
      flaggedOnly: true,
      since: "2026-10-06T16:00:00.000Z",
      actorUserId: "u1",
      subjectType: "order",
      subjectRef: "o1",
      search: "  #14 ",
    });

    // Assert
    expect(calls[0].fn).toBe("get_store_activity");
    expect(calls[0].args).toEqual({
      p_tenant_id: TENANT,
      p_limit: ACTIVITY_PAGE_SIZE,
      p_before_occurred_at: null,
      p_before_id: null,
      p_since: "2026-10-06T16:00:00.000Z",
      p_until: null,
      p_categories: ["money", "cash"],
      p_outlet_id: null,
      p_actor_user_id: "u1",
      p_flagged_only: true,
      p_include_routine: false,
      p_search: "#14",
      p_subject_type: "order",
      p_subject_ref: "o1",
    });
  });

  it("sends no category list when every category is wanted", async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    await fetchActivityPage(client, { tenantId: TENANT, categories: [] });
    expect(calls[0].args.p_categories).toBeNull();
    expect(calls[0].args.p_search).toBeNull();
  });

  it("returns a cursor taken from the RAW last row, keeping microseconds", async () => {
    // Arrange: a full page. The cursor must not be the parsed (millisecond)
    // time, or rows between .123000 and .123456 would be skipped.
    const rows = Array.from({ length: 2 }, (_, index) =>
      rawRow({ id: `a${index}`, occurred_at: `2026-10-12T04:33:00.12345${index}+00:00` }),
    );
    const { client } = fakeClient([{ data: rows, error: null }]);

    // Act
    const page = await fetchActivityPage(client, { tenantId: TENANT, limit: 2 });

    // Assert
    expect(page.events).toHaveLength(2);
    expect(page.nextCursor).toEqual({ occurredAt: "2026-10-12T04:33:00.123451+00:00", id: "a1" });
  });

  it("keeps paging past a row this build cannot read", async () => {
    // A newer server kind is dropped by the parser, but it still counts toward
    // the page, so the cursor comes from it and the next page starts after it.
    const rows = [rawRow({ id: "a1" }), rawRow({ id: "zz", kind: "future.kind" })];
    const { client } = fakeClient([{ data: rows, error: null }]);

    const page = await fetchActivityPage(client, { tenantId: TENANT, limit: 2 });

    expect(page.events.map((event) => event.id)).toEqual(["a1"]);
    expect(page.nextCursor?.id).toBe("zz");
  });

  it("stops paging on a short page", async () => {
    const { client } = fakeClient([{ data: [rawRow()], error: null }]);
    const page = await fetchActivityPage(client, { tenantId: TENANT, limit: 2 });
    expect(page.nextCursor).toBeNull();
  });

  it("passes the cursor back as the keyset", async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    await fetchActivityPage(client, {
      tenantId: TENANT,
      cursor: { occurredAt: "2026-10-12T04:33:00.123456+00:00", id: "a9" },
    });
    expect(calls[0].args.p_before_occurred_at).toBe("2026-10-12T04:33:00.123456+00:00");
    expect(calls[0].args.p_before_id).toBe("a9");
  });

  it("clamps the page size to the server's maximum", async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    await fetchActivityPage(client, { tenantId: TENANT, limit: 500 });
    expect(calls[0].args.p_limit).toBe(100);
  });

  it("refuses to query without a store", async () => {
    const { client } = fakeClient([]);
    await expect(fetchActivityPage(client, { tenantId: "" })).rejects.toThrow(/store/i);
  });

  it("turns a refusal into a plain-language error that keeps its code", async () => {
    const { client } = fakeClient([{ data: null, error: { message: "Not allowed", code: "42501" } }]);
    const failure = await fetchActivityPage(client, { tenantId: TENANT }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ActivityRepoError);
    expect((failure as ActivityRepoError).code).toBe("42501");
    expect((failure as ActivityRepoError).message).toMatch(/not allowed/i);
  });
});

describe("fetchActivitySummary", () => {
  it("asks for the window and parses the totals", async () => {
    const { client, calls } = fakeClient([
      {
        data: {
          byKind: [{ kind: "refund.issued", statutory: false, count: 1, amount: -185, quantity: null }],
          byActor: [],
          byDay: [],
          flaggedOpen: 2,
        },
        error: null,
      },
    ]);

    const summary = await fetchActivitySummary(client, {
      tenantId: TENANT,
      since: "2026-10-11T16:00:00.000Z",
      until: "2026-10-12T16:00:00.000Z",
      outletId: "out-1",
    });

    expect(calls[0]).toEqual({
      fn: "get_store_activity_summary",
      args: {
        p_tenant_id: TENANT,
        p_since: "2026-10-11T16:00:00.000Z",
        p_until: "2026-10-12T16:00:00.000Z",
        p_outlet_id: "out-1",
      },
    });
    expect(summary.flaggedOpen).toBe(2);
    expect(summary.byKind[0].amount).toBe(-185);
  });
});

describe("markActivityReviewed", () => {
  it("returns when the row was reviewed", async () => {
    const { client, calls } = fakeClient([{ data: "2026-10-12T05:05:00+00:00", error: null }]);
    const at = await markActivityReviewed(client, "a1");
    expect(calls[0]).toEqual({ fn: "mark_store_activity_reviewed", args: { p_id: "a1" } });
    expect(at).toBe("2026-10-12T05:05:00.000Z");
  });

  it("treats an empty answer as a failure, never as success", async () => {
    const { client } = fakeClient([{ data: null, error: null }]);
    await expect(markActivityReviewed(client, "a1")).rejects.toThrow(/couldn't mark/i);
  });
});

describe("isActivityUnavailable", () => {
  it("recognises a database that has not got the activity functions yet", () => {
    expect(isActivityUnavailable(new ActivityRepoError("x", "PGRST202"))).toBe(true);
    expect(isActivityUnavailable(new ActivityRepoError("x", "42883"))).toBe(true);
    expect(isActivityUnavailable(new ActivityRepoError("x", "42501"))).toBe(false);
    expect(isActivityUnavailable(new Error("x"))).toBe(false);
  });
});
