import { thumbUrl } from "./image-thumb";

const IMAGEKIT = "https://ik.imagekit.io/hau6qlmlz/menu-items/latte.jpg";
const CLOUDINARY = "https://res.cloudinary.com/demo/image/upload/v1699/menu/latte.jpg";

describe("thumbUrl", () => {
  it("returns null for a missing image so callers render a placeholder", () => {
    expect(thumbUrl(null, 200)).toBeNull();
    expect(thumbUrl(undefined, 200)).toBeNull();
    expect(thumbUrl("   ", 200)).toBeNull();
  });

  it("asks ImageKit for a width-bounded, recompressed copy", () => {
    const result = thumbUrl(IMAGEKIT, 200);
    expect(result).toBe(`${IMAGEKIT}?tr=w-200,q-70,f-auto`);
  });

  it("replaces an existing ImageKit transformation rather than stacking one", () => {
    const result = thumbUrl(`${IMAGEKIT}?tr=w-1600`, 200);
    expect(result).toBe(`${IMAGEKIT}?tr=w-200,q-70,f-auto`);
  });

  it("keeps other ImageKit query params intact", () => {
    const result = thumbUrl(`${IMAGEKIT}?updatedAt=123`, 200);
    expect(result).toContain("updatedAt=123");
    expect(result).toContain("tr=w-200,q-70,f-auto");
  });

  it("inserts a Cloudinary transformation after the upload segment", () => {
    expect(thumbUrl(CLOUDINARY, 200)).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_200,q_70,f_auto/v1699/menu/latte.jpg",
    );
  });

  it("leaves a URL on an unrecognised host untouched", () => {
    const external = "https://example.com/photos/latte.jpg";
    expect(thumbUrl(external, 200)).toBe(external);
  });

  it("leaves a local file uri untouched so a picked image still previews", () => {
    const local = "file:///var/mobile/tmp/latte.jpg";
    expect(thumbUrl(local, 200)).toBe(local);
  });

  it("ignores a nonsensical size instead of emitting a broken transformation", () => {
    expect(thumbUrl(IMAGEKIT, 0)).toBe(IMAGEKIT);
    expect(thumbUrl(IMAGEKIT, -50)).toBe(IMAGEKIT);
    expect(thumbUrl(IMAGEKIT, Number.NaN)).toBe(IMAGEKIT);
  });

  it("rounds a fractional size, since transformations take whole pixels", () => {
    expect(thumbUrl(IMAGEKIT, 199.6)).toBe(`${IMAGEKIT}?tr=w-200,q-70,f-auto`);
  });
});
