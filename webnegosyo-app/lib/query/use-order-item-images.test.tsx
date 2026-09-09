/**
 * Thumbnails for order lines, cached per STORE.
 *
 * The old module-wide cache was never cleared on sign-out or when a
 * superadmin switched stores, so ids looked up under one tenant were served
 * to the next. The cache is now keyed by the tenant in scope, and a tenant
 * change is a fresh lookup.
 */
import { renderHook, waitFor } from "@testing-library/react-native";

const mockFetchProductImages = jest.fn();
jest.mock("../order-item-images", () => ({
  fetchProductImages: (...args: unknown[]) => mockFetchProductImages(...args),
}));

import { useAuthStore } from "../../stores/auth-store";
import {
  resetOrderItemImageCaches,
  useOrderItemImages,
} from "../../hooks/use-order-item-images";

beforeEach(() => {
  resetOrderItemImageCaches();
  useAuthStore.getState().clear();
  mockFetchProductImages.mockReset().mockResolvedValue(new Map([["m1", "https://a/1.jpg"]]));
});

describe("useOrderItemImages", () => {
  it("resolves images for the tenant in scope and remembers ids it has tried", async () => {
    useAuthStore.getState().setAuth({ tenantId: "t1" });
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useOrderItemImages(ids), {
      initialProps: { ids: ["m1", "m2", "m1", ""] },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.images.get("m1")).toBe("https://a/1.jpg");
    expect(result.current.images.has("m2")).toBe(false);
    expect(mockFetchProductImages).toHaveBeenCalledTimes(1);
    expect(mockFetchProductImages).toHaveBeenCalledWith(["m1", "m2"]);

    // m2 had no image; asking again must not refetch it.
    rerender({ ids: ["m2", "m1"] });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetchProductImages).toHaveBeenCalledTimes(1);
  });

  it("never serves one store's thumbnails to another", async () => {
    useAuthStore.getState().setAuth({ tenantId: "t1" });
    const { result } = renderHook(() => useOrderItemImages(["m1"]));
    await waitFor(() => expect(result.current.images.get("m1")).toBe("https://a/1.jpg"));

    mockFetchProductImages.mockResolvedValue(new Map());
    useAuthStore.getState().setAuth({ impersonatedTenantId: "t2" });

    await waitFor(() => expect(mockFetchProductImages).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.images.has("m1")).toBe(false);

    // Back on the first store, its thumbnails are still there without a fetch.
    useAuthStore.getState().setAuth({ impersonatedTenantId: null });
    await waitFor(() => expect(result.current.images.get("m1")).toBe("https://a/1.jpg"));
    expect(mockFetchProductImages).toHaveBeenCalledTimes(2);
  });

  it("fetches nothing without a tenant or without ids", () => {
    const { result, unmount } = renderHook(() => useOrderItemImages(["m1"]));
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchProductImages).not.toHaveBeenCalled();
    unmount();

    useAuthStore.getState().setAuth({ tenantId: "t1" });
    const empty = renderHook(() => useOrderItemImages([]));
    expect(empty.result.current.images.size).toBe(0);
    expect(mockFetchProductImages).not.toHaveBeenCalled();
  });

  it("degrades to no image when the lookup fails, and does not loop", async () => {
    useAuthStore.getState().setAuth({ tenantId: "t1" });
    mockFetchProductImages.mockRejectedValue(new Error("offline"));
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useOrderItemImages(ids), {
      initialProps: { ids: ["m1"] },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.images.size).toBe(0);

    rerender({ ids: ["m1"] });
    expect(mockFetchProductImages).toHaveBeenCalledTimes(1);
  });
});
