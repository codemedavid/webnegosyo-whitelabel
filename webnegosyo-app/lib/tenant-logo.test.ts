jest.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { webAppUrl: "https://webnegosyo.com" } },
  },
}));

import {
  TENANT_LOGO_FOLDER,
  isValidLogoUrl,
  logoThumbUrl,
  logoUpdatePayload,
} from "./tenant-logo";
import { uploadTenantLogo } from "./product-image-upload";
import { LOGO_FILE_NAME, toPickedImage } from "./image-picker";

describe("TENANT_LOGO_FOLDER", () => {
  it("keeps logos in their own ImageKit folder", () => {
    // Menu photos and logos have different lifecycles; mixing them makes a
    // folder-wide cleanup of one destroy the other.
    expect(TENANT_LOGO_FOLDER).toBe("tenant-logos");
  });
});

describe("logoThumbUrl", () => {
  it("requests a CDN-resized copy for an ImageKit logo", () => {
    const url = logoThumbUrl("https://ik.imagekit.io/acme/tenant-logos/a.png", 88);

    expect(url).toContain("tr=w-88");
  });

  it("returns null when the tenant has no logo", () => {
    // The caller renders the monogram fallback on null.
    expect(logoThumbUrl(null, 88)).toBeNull();
    expect(logoThumbUrl(undefined, 88)).toBeNull();
  });

  it("returns null for a blank string rather than a broken image source", () => {
    expect(logoThumbUrl("   ", 88)).toBeNull();
  });

  it("leaves an unrecognised host untouched", () => {
    const url = "https://cdn.example.com/logo.png";

    expect(logoThumbUrl(url, 88)).toBe(url);
  });
});

describe("isValidLogoUrl", () => {
  it("accepts an https url", () => {
    expect(isValidLogoUrl("https://ik.imagekit.io/acme/logo.png")).toBe(true);
  });

  it("accepts an http url", () => {
    expect(isValidLogoUrl("http://example.com/logo.png")).toBe(true);
  });

  it("rejects a blank value", () => {
    expect(isValidLogoUrl("")).toBe(false);
    expect(isValidLogoUrl("   ")).toBe(false);
  });

  it("rejects a non-http scheme", () => {
    // A javascript: or data: value must never reach an <Image source>.
    expect(isValidLogoUrl("javascript:alert(1)")).toBe(false);
    expect(isValidLogoUrl("data:image/png;base64,AAAA")).toBe(false);
  });

  it("rejects a value that is not a url at all", () => {
    expect(isValidLogoUrl("not a url")).toBe(false);
  });
});

describe("logoUpdatePayload", () => {
  it("writes the uploaded url to the logo_url column", () => {
    expect(logoUpdatePayload("https://ik.imagekit.io/acme/logo.png")).toEqual({
      logo_url: "https://ik.imagekit.io/acme/logo.png",
    });
  });

  it("clears the column with null when the logo is removed", () => {
    // Empty string would render as a broken image on the storefront; null is
    // the column's real "no logo" value.
    expect(logoUpdatePayload(null)).toEqual({ logo_url: null });
  });

  it("refuses to store an unsafe url", () => {
    expect(() => logoUpdatePayload("javascript:alert(1)")).toThrow();
  });
});

describe("uploadTenantLogo", () => {
  const picked = {
    uri: "file:///tmp/logo.png",
    fileName: "logo.png",
    mimeType: "image/png",
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uploads into the tenant-logos folder", async () => {
    const fetchMock = jest
      .fn()
      // 1st call: the signed-auth endpoint.
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "t",
          expire: 1,
          signature: "s",
          publicKey: "p",
        }),
      })
      // 2nd call: the ImageKit upload itself.
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: "https://ik.imagekit.io/acme/tenant-logos/logo.png",
          fileId: "f1",
          filePath: "/tenant-logos/logo.png",
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadTenantLogo(picked);

    expect(result.url).toBe("https://ik.imagekit.io/acme/tenant-logos/logo.png");
    const body = fetchMock.mock.calls[1][1].body as FormData;
    expect(body.get("folder")).toBe("tenant-logos");
  });

  it("surfaces a failed upload as an error", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    await expect(uploadTenantLogo(picked)).rejects.toThrow();
  });
});

describe("logo picker defaults", () => {
  it("names an unnamed logo asset distinctly from a product photo", () => {
    // Both land in ImageKit; a shared "product.jpg" default makes the uploaded
    // file impossible to identify later.
    expect(LOGO_FILE_NAME).toBe("logo.jpg");
  });

  it("keeps the asset's own filename when the picker supplies one", () => {
    const image = toPickedImage({
      uri: "file:///tmp/x.png",
      fileName: "brand.png",
      mimeType: "image/png",
    });

    expect(image.fileName).toBe("brand.png");
  });
});
