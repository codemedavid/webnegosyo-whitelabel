import { validateConvexCredentials, syncTenantConfig } from "@/lib/convex-deploy";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("convex-deploy", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("validateConvexCredentials", () => {
    it("returns true when credentials are valid (non-401/403 response)", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 400, // 400 = function not found, but creds are valid
      });

      const result = await validateConvexCredentials(
        "https://test.convex.cloud",
        "prod:test|key123"
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.convex.cloud/api/query",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Convex prod:test|key123",
          }),
        })
      );
    });

    it("returns false when credentials are unauthorized (401)", async () => {
      mockFetch.mockResolvedValueOnce({ status: 401 });

      const result = await validateConvexCredentials(
        "https://test.convex.cloud",
        "invalid-key"
      );

      expect(result).toBe(false);
    });

    it("returns false when credentials are forbidden (403)", async () => {
      mockFetch.mockResolvedValueOnce({ status: 403 });

      const result = await validateConvexCredentials(
        "https://test.convex.cloud",
        "invalid-key"
      );

      expect(result).toBe(false);
    });

    it("returns false when fetch throws (network error)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await validateConvexCredentials(
        "https://unreachable.convex.cloud",
        "some-key"
      );

      expect(result).toBe(false);
    });

    it("returns true for 200 OK response", async () => {
      mockFetch.mockResolvedValueOnce({ status: 200 });

      const result = await validateConvexCredentials(
        "https://test.convex.cloud",
        "valid-key"
      );

      expect(result).toBe(true);
    });
  });

  describe("syncTenantConfig", () => {
    it("syncs all config keys successfully", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await syncTenantConfig(
        "https://test.convex.cloud",
        "prod:test|key123",
        {
          lalamove_api_key: "lala-key",
          restaurant_address: "123 Main St",
        }
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify first call
      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[0]).toBe("https://test.convex.cloud/api/mutation");
      const firstBody = JSON.parse(firstCall[1].body);
      expect(firstBody.path).toBe("config:upsertConfig");
      expect(firstBody.args.key).toBe("lalamove_api_key");
      expect(firstBody.args.value).toBe("lala-key");
    });

    it("returns false when a config sync fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await syncTenantConfig(
        "https://test.convex.cloud",
        "prod:test|key123",
        { some_key: "some_value" }
      );

      expect(result).toBe(false);
    });

    it("returns true for empty config object", async () => {
      const result = await syncTenantConfig(
        "https://test.convex.cloud",
        "prod:test|key123",
        {}
      );

      expect(result).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns false when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await syncTenantConfig(
        "https://test.convex.cloud",
        "prod:test|key123",
        { key: "value" }
      );

      expect(result).toBe(false);
    });
  });
});
