let mockResponse: { data: unknown; error: unknown } = { data: [], error: null };
const mockIn = jest.fn(() => Promise.resolve(mockResponse));
const mockSelect = jest.fn(() => ({ in: mockIn }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock("./supabase", () => ({
  supabase: { from: mockFrom },
}));

import { fetchProductImages } from "./order-item-images";

beforeEach(() => {
  jest.clearAllMocks();
  mockResponse = { data: [], error: null };
});

describe("fetchProductImages", () => {
  it("returns an empty map without querying when there are no ids", async () => {
    const map = await fetchProductImages([]);
    expect(map.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("maps menu item ids to their image urls", async () => {
    mockResponse = {
      data: [
        { id: "a", image_url: "https://cdn/a.jpg" },
        { id: "b", image_url: "https://cdn/b.jpg" },
      ],
      error: null,
    };
    const map = await fetchProductImages(["a", "b"]);
    expect(mockFrom).toHaveBeenCalledWith("menu_items");
    expect(map.get("a")).toBe("https://cdn/a.jpg");
    expect(map.get("b")).toBe("https://cdn/b.jpg");
  });

  it("dedupes and drops falsy ids before querying", async () => {
    await fetchProductImages(["a", "a", "", "b"]);
    expect(mockIn).toHaveBeenCalledWith("id", ["a", "b"]);
  });

  it("omits rows with a missing or blank image url", async () => {
    mockResponse = {
      data: [
        { id: "a", image_url: "" },
        { id: "b", image_url: null },
        { id: "c", image_url: "https://cdn/c.jpg" },
      ],
      error: null,
    };
    const map = await fetchProductImages(["a", "b", "c"]);
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(false);
    expect(map.get("c")).toBe("https://cdn/c.jpg");
  });

  it("degrades to an empty map on a query error instead of throwing", async () => {
    mockResponse = { data: null, error: { message: "boom" } };
    const map = await fetchProductImages(["a"]);
    expect(map.size).toBe(0);
  });
});
