import { fetchReceiptLayout, saveReceiptLayout } from "./receipt-layout-service";

/**
 * A stand-in for the supabase-js builder chain. Records what was sent and
 * settles with `result` (or never, to model a hung request).
 */
function fakeClient(result: { data?: unknown; error?: { code: string; message: string } | null } | "hang") {
  const calls: { update?: unknown; eq?: [string, string]; select?: string } = {};
  const settle = () =>
    result === "hang" ? new Promise(() => {}) : Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    update: (value: unknown) => ((calls.update = value), chain),
    eq: (col: string, val: string) => ((calls.eq = [col, val]), chain),
    select: (cols: string) => ((calls.select = cols), chain),
    abortSignal: () => chain,
    maybeSingle: () => settle(),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => settle().then(resolve, reject),
  });
  const client = { from: () => chain } as never;
  return { client, calls };
}

beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe("saveReceiptLayout", () => {
  it("writes a preset name to the store's own row and confirms it landed", async () => {
    const { client, calls } = fakeClient({ data: [{ id: "t1" }] });
    const outcome = await saveReceiptLayout(client, "t1", "compact");
    expect(outcome).toEqual({ ok: true, saved: "compact" });
    expect(calls.update).toEqual({ receipt_layout: "compact" });
    expect(calls.eq).toEqual(["id", "t1"]);
    expect(calls.select).toBe("id");
  });

  it("refuses a layout the printer would not parse without sending it", async () => {
    const { client, calls } = fakeClient({ data: [{ id: "t1" }] });
    const outcome = await saveReceiptLayout(client, "t1", { version: 1, blocks: [] });
    expect(outcome).toMatchObject({ ok: false, reason: "invalid" });
    expect(calls.update).toBeUndefined();
  });

  it("reads zero changed rows as refused, not published", async () => {
    const { client } = fakeClient({ data: [] });
    expect(await saveReceiptLayout(client, "t1", "modern")).toMatchObject({ ok: false, reason: "refused" });
  });

  it("reads a permission error as refused", async () => {
    const { client } = fakeClient({ error: { code: "42501", message: "denied" } });
    expect(await saveReceiptLayout(client, "t1", "modern")).toMatchObject({ ok: false, reason: "refused" });
  });

  it("gives up on a hung request instead of spinning forever", async () => {
    const { client } = fakeClient("hang");
    expect(await saveReceiptLayout(client, "t1", "modern", 20)).toMatchObject({ ok: false, reason: "timeout" });
  });
});

describe("fetchReceiptLayout", () => {
  it("returns the saved layout and logo", async () => {
    const { client } = fakeClient({ data: { receipt_layout: "classic", logo_url: "https://x/logo.png" } });
    expect(await fetchReceiptLayout(client, "t1")).toEqual({ ok: true, layout: "classic", logoUrl: "https://x/logo.png" });
  });

  it("reads a missing column value as nothing saved", async () => {
    const { client } = fakeClient({ data: { receipt_layout: null, logo_url: null } });
    expect(await fetchReceiptLayout(client, "t1")).toEqual({ ok: true, layout: null, logoUrl: null });
  });

  it("fails soft on a hung request", async () => {
    const { client } = fakeClient("hang");
    expect(await fetchReceiptLayout(client, "t1", 20)).toEqual({ ok: false });
  });
});
