import { fetchLogoBase64, MAX_LOGO_BYTES } from "./receipt-logo";

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
});
