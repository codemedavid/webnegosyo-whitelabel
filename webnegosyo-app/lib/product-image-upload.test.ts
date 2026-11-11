jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { webAppUrl: "https://webnegosyo.com" } },
  },
}));

// The picked file is read so R2 can sign its exact size.
jest.mock("./local-file", () => ({
  readLocalFile: jest.fn(async () => ({ size: 2048 })),
}));

// The signed-upload request carries the staff member's own session token.
jest.mock("./authorized-post", () => ({
  getAccessTokenBounded: jest.fn(async () => "access-token"),
}));

import { getAccessTokenBounded } from "./authorized-post";
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

/** What POST /api/imagekit/auth answers: a v2 token plus the exact fields it signed. */
function signedAuth(folder: string, fileName: string) {
  return {
    token: "signed.jwt",
    publicKey: "pub",
    fields: { fileName, folder, useUniqueFileName: "true", overwriteFile: "false" },
    uploadUrl: "https://upload.imagekit.io/api/v2/files/upload",
  };
}

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
        json: async () => signedAuth("menu-items", "latte.jpg"),
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
        json: async () => signedAuth("menu-items", "latte.jpg"),
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
  function mockUpload(folder: string) {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => signedAuth(folder, "proof.jpg"),
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
    const fetchMock = mockUpload("payment-proofs");
    const result = await uploadImage(image, PAYMENT_PROOF_FOLDER);

    expect(folderSentTo(fetchMock)).toBe("payment-proofs");
    expect(result.fileId).toBe("f1");
  });

  it("keeps routing product images to the menu-items folder", async () => {
    const fetchMock = mockUpload("menu-items");
    await uploadProductImage(image);

    expect(folderSentTo(fetchMock)).toBe("menu-items");
    expect(PRODUCT_IMAGE_FOLDER).toBe("menu-items");
  });
});

describe("signed upload request", () => {
  const originalFetch = global.fetch;
  const image = { uri: "file:///tmp/latte.jpg", fileName: "latte.jpg", mimeType: "image/jpeg" };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.mocked(getAccessTokenBounded).mockResolvedValue("access-token");
  });

  it("asks the web app to sign the folder + file name as the signed-in staff member", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => signedAuth("menu-items", "latte.jpg") })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "u", fileId: "f", filePath: "/menu-items/latte.jpg" }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await uploadProductImage(image);

    const [authUrl, authInit] = fetchMock.mock.calls[0];
    expect(authUrl).toBe("https://webnegosyo.com/api/uploads/sign");
    expect(authInit.method).toBe("POST");
    expect(authInit.headers.Authorization).toBe("Bearer access-token");
    expect(JSON.parse(authInit.body)).toEqual({
      folder: "menu-items",
      fileName: "latte.jpg",
      contentType: "image/jpeg",
      size: 2048,
    });
  });

  it("uploads to the v2 endpoint with exactly the signed fields plus the token", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => signedAuth("menu-items", "latte.jpg") })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "u", fileId: "f", filePath: "/menu-items/latte.jpg" }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await uploadProductImage(image);

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1];
    expect(uploadUrl).toBe("https://upload.imagekit.io/api/v2/files/upload");
    const body = uploadInit.body as FormData;
    expect(body.get("token")).toBe("signed.jwt");
    expect(body.get("overwriteFile")).toBe("false");
    expect(body.get("useUniqueFileName")).toBe("true");
    expect(body.get("publicKey")).toBeNull();
    expect(body.get("signature")).toBeNull();
  });

  it("refuses to upload when the staff session cannot be read", async () => {
    jest.mocked(getAccessTokenBounded).mockResolvedValue(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(uploadProductImage(image)).rejects.toThrow(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("uploads to Cloudflare R2 when the web app signs one", () => {
  const originalFetch = global.fetch;
  const image = { uri: "file:///tmp/latte.jpg", fileName: "latte.jpg", mimeType: "image/jpeg" };
  const R2_SIGNED = {
    provider: "r2",
    uploadUrl: "https://acc.r2.cloudflarestorage.com/webnegosyo-media/menu-items/latte-1.jpg?X-Amz-Signature=s",
    method: "PUT",
    headers: { "content-type": "image/jpeg", "if-none-match": "*" },
    url: "https://media.webnegosyo.com/menu-items/latte-1.jpg",
    fileId: "r2:menu-items/latte-1.jpg",
    filePath: "menu-items/latte-1.jpg",
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("PUTs the file bytes with exactly the signed headers and returns the media url", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => R2_SIGNED })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadProductImage(image);

    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe(R2_SIGNED.uploadUrl);
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers).toEqual(R2_SIGNED.headers);
    expect(putInit.body).toEqual({ size: 2048 });
    expect(result).toEqual({
      url: "https://media.webnegosyo.com/menu-items/latte-1.jpg",
      fileId: "r2:menu-items/latte-1.jpg",
      filePath: "menu-items/latte-1.jpg",
    });
  });

  it("throws a friendly error when R2 refuses the upload", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => R2_SIGNED })
      .mockResolvedValueOnce({ ok: false, status: 403 }) as unknown as typeof fetch;

    await expect(uploadProductImage(image)).rejects.toThrow("Upload failed");
  });

  it("falls back to the ImageKit-only route on a web deploy that predates the sign route", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => signedAuth("menu-items", "latte.jpg") })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://ik.imagekit.io/d/menu-items/latte.jpg", fileId: "f", filePath: "/menu-items/latte.jpg" }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadProductImage(image);

    expect(fetchMock.mock.calls[1][0]).toBe("https://webnegosyo.com/api/imagekit/auth");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ folder: "menu-items", fileName: "latte.jpg" });
    expect(result.fileId).toBe("f");
  });
});
