jest.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { webAppUrl: "https://webnegosyo.com" } },
  },
}));

import {
  parseUploadResponse,
  uploadImage,
  uploadProductImage,
  PAYMENT_PROOF_FOLDER,
  PRODUCT_IMAGE_FOLDER,
} from "./product-image-upload";

describe("parseUploadResponse", () => {
  it("returns the normalized result when all fields are present", () => {
    const result = parseUploadResponse({
      url: "https://ik.imagekit.io/demo/menu-items/latte.jpg",
      fileId: "abc123",
      filePath: "/menu-items/latte.jpg",
    });

    expect(result).toEqual({
      url: "https://ik.imagekit.io/demo/menu-items/latte.jpg",
      fileId: "abc123",
      filePath: "menu-items/latte.jpg",
    });
  });

  it("throws when the url is missing", () => {
    expect(() =>
      parseUploadResponse({ fileId: "abc123", filePath: "/x.jpg" })
    ).toThrow();
  });

  it("throws when fileId is missing", () => {
    expect(() =>
      parseUploadResponse({ url: "https://x", filePath: "/x.jpg" })
    ).toThrow();
  });
});

describe("uploadProductImage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches auth then uploads and returns the delivery url", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "tok",
          expire: 123,
          signature: "sig",
          publicKey: "pub",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "https://ik.imagekit.io/demo/menu-items/latte.jpg",
          fileId: "abc123",
          filePath: "/menu-items/latte.jpg",
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadProductImage({
      uri: "file:///tmp/latte.jpg",
      fileName: "latte.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.url).toBe("https://ik.imagekit.io/demo/menu-items/latte.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a friendly error when fetching auth fails", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      uploadProductImage({
        uri: "file:///tmp/latte.jpg",
        fileName: "latte.jpg",
        mimeType: "image/jpeg",
      })
    ).rejects.toThrow("Could not authorize upload");
  });

  it("throws a friendly error when the upload itself fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "tok",
          expire: 123,
          signature: "sig",
          publicKey: "pub",
        }),
      })
      .mockResolvedValueOnce({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      uploadProductImage({
        uri: "file:///tmp/latte.jpg",
        fileName: "latte.jpg",
        mimeType: "image/jpeg",
      })
    ).rejects.toThrow("Upload failed");
  });
});

describe("uploadImage folder routing", () => {
  const originalFetch = global.fetch;
  const image = {
    uri: "file:///tmp/proof.jpg",
    fileName: "proof.jpg",
    mimeType: "image/jpeg",
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /** Mock auth + upload, and hand back the FormData the upload was sent with. */
  function mockUpload() {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "tok", expire: 1, signature: "sig", publicKey: "pub" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "https://ik.imagekit.io/demo/payment-proofs/proof.jpg",
          fileId: "f1",
          filePath: "/payment-proofs/proof.jpg",
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  function folderSentTo(fetchMock: jest.Mock): unknown {
    const body = fetchMock.mock.calls[1][1].body as FormData;
    return body.get("folder");
  }

  it("uploads a payment proof into the payment-proofs folder", async () => {
    const fetchMock = mockUpload();
    const result = await uploadImage(image, PAYMENT_PROOF_FOLDER);

    expect(folderSentTo(fetchMock)).toBe("payment-proofs");
    expect(result.fileId).toBe("f1");
  });

  it("keeps routing product images to the menu-items folder", async () => {
    const fetchMock = mockUpload();
    await uploadProductImage(image);

    expect(folderSentTo(fetchMock)).toBe("menu-items");
    expect(PRODUCT_IMAGE_FOLDER).toBe("menu-items");
  });
});
