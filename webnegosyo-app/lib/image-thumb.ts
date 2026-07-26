/**
 * Rewrites a product image url into a small, CDN-resized thumbnail.
 *
 * Product images are uploaded at full camera resolution (often 1–3 MB). Handing
 * those to a grid of tiles would spend the whole cell budget on decoding: the
 * bytes are downloaded, decompressed to a full-size bitmap in memory, then
 * thrown away to draw a ~110pt square. Asking the CDN for a width-bounded,
 * recompressed copy turns each tile into a few kilobytes and a cheap decode.
 *
 * Pure and offline — it only rewrites strings, never fetches. Anything it does
 * not recognise is returned unchanged, so an unexpected host degrades to
 * "slower but correct" rather than a broken image.
 */

const IMAGEKIT_HOST = "ik.imagekit.io";
const CLOUDINARY_HOST = "res.cloudinary.com";
const CLOUDINARY_UPLOAD = "/upload/";

/** Quality floor that still looks clean at thumbnail size. */
const QUALITY = 70;

function isUsableSize(size: number): boolean {
  return Number.isFinite(size) && size > 0;
}

function imagekitThumb(url: string, width: number): string {
  const [base, query = ""] = url.split("?");
  const search = new URLSearchParams(query);
  // Overwrite rather than append: a stacked `tr` would be ignored or, worse,
  // resolved to the larger of the two.
  search.set("tr", `w-${width},q-${QUALITY},f-auto`);
  return `${base}?${search.toString().replace(/%2C/gi, ",")}`;
}

function cloudinaryThumb(url: string, width: number): string {
  const index = url.indexOf(CLOUDINARY_UPLOAD);
  if (index < 0) return url;
  const cut = index + CLOUDINARY_UPLOAD.length;
  return `${url.slice(0, cut)}w_${width},q_${QUALITY},f_auto/${url.slice(cut)}`;
}

/**
 * A thumbnail url at most `size` pixels wide, or null when there is no image.
 *
 * @param size Target width in pixels — pass the rendered width times the screen
 *   scale, not the layout width, or the image will look soft on a retina panel.
 */
export function thumbUrl(url: string | null | undefined, size: number): string | null {
  if (!url || url.trim() === "") return null;
  if (!isUsableSize(size)) return url;

  const width = Math.round(size);

  if (url.includes(IMAGEKIT_HOST)) return imagekitThumb(url, width);
  if (url.includes(CLOUDINARY_HOST)) return cloudinaryThumb(url, width);

  // Local file uris, legacy hosts, anything else: leave it alone.
  return url;
}
