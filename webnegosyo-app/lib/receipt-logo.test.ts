import {
  fetchLogoBase64,
  prefetchLogo,
  isLogoCached,
  clearLogoCache,
  MAX_LOGO_BYTES,
} from "./receipt-logo";

/**
 * The logo block downloads the tenant's logo and hands it to the printer as
 * base64 (the native side decodes PNG/JPEG via UIImage / BitmapFactory, same
 * path the QR raster uses). Every failure returns null — a logo that cannot
 * be fetched must never stop the receipt itself from printing.
 */

function mockFetchResponse(response: Partial<Response> | Error): jest.Mock {
  const mock = jest.fn();
  if (response instanceof Error) mock.mockRejectedValue(response);
  else mock.mockResolvedValue(response);
  (globalThis as { fetch: unknown }).fetch = mock;
  return mock;
}

describe("fetchLogoBase64", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as { fetch: unknown }).fetch = originalFetch;
    clearLogoCache();
  });

  it("returns the downloaded bytes as base64", async () => {
    const bytes = new Uint8Array([72, 105, 33]); // "Hi!"
    mockFetchResponse({
      ok: true,
      arrayBuffer: async () => bytes.buffer,
    });
    await expect(fetchLogoBase64("https://ik.example/logo.png")).resolves.toBe("SGkh");
  });

  it("returns null on an HTTP error", async () => {
    mockFetchResponse({ ok: false, status: 404 });
    await expect(fetchLogoBase64("https://ik.example/gone.png")).resolves.toBeNull();
  });

  it("returns null when the network throws", async () => {
    mockFetchResponse(new Error("offline"));
    await expect(fetchLogoBase64("https://ik.example/logo.png")).resolves.toBeNull();
  });

  it("returns null for an empty body", async () => {
    mockFetchResponse({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    await expect(fetchLogoBase64("https://ik.example/empty.png")).resolves.toBeNull();
  });

  it("refuses an oversized file — a huge raster stalls the printer", async () => {
    mockFetchResponse({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(MAX_LOGO_BYTES + 1),
    });
    await expect(fetchLogoBase64("https://ik.example/huge.png")).resolves.toBeNull();
  });

  it("serves the second print from memory — the logo is downloaded once, not per receipt", async () => {
    const bytes = new Uint8Array([72, 105, 33]);
    const mock = mockFetchResponse({ ok: true, arrayBuffer: async () => bytes.buffer });

    await fetchLogoBase64("https://ik.example/logo.png");
    await fetchLogoBase64("https://ik.example/logo.png");

    expect(mock).toHaveBeenCalledTimes(1);
    expect(isLogoCached("https://ik.example/logo.png")).toBe(true);
  });

  it("does not cache a failure — the next receipt tries the download again", async () => {
    const mock = mockFetchResponse(new Error("offline"));
    await fetchLogoBase64("https://ik.example/logo.png");
    await fetchLogoBase64("https://ik.example/logo.png");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(isLogoCached("https://ik.example/logo.png")).toBe(false);
  });

  it("shares one in-flight download between concurrent callers", async () => {
    const bytes = new Uint8Array([72, 105, 33]);
    const mock = mockFetchResponse({ ok: true, arrayBuffer: async () => bytes.buffer });
    await Promise.all([
      fetchLogoBase64("https://ik.example/logo.png"),
      fetchLogoBase64("https://ik.example/logo.png"),
    ]);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("prefetchLogo warms the cache so the first receipt pays no network hop", async () => {
    const bytes = new Uint8Array([72, 105, 33]);
    const mock = mockFetchResponse({ ok: true, arrayBuffer: async () => bytes.buffer });
    prefetchLogo("https://ik.example/logo.png");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(isLogoCached("https://ik.example/logo.png")).toBe(true);
    await fetchLogoBase64("https://ik.example/logo.png");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("prefetchLogo ignores an absent URL", () => {
    const mock = mockFetchResponse({ ok: true, arrayBuffer: async () => new ArrayBuffer(3) });
    prefetchLogo(null);
    prefetchLogo(undefined);
    expect(mock).not.toHaveBeenCalled();
  });

  it("gives up on a download that outlives the timeout — the receipt prints without it", async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const pending = fetchLogoBase64("https://ik.example/slow.png", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 1_000,
    });
    await jest.advanceTimersByTimeAsync(1_100);
    await expect(pending).resolves.toBeNull();
    jest.useRealTimers();
  });
});
