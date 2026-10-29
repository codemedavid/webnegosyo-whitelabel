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
/** Cloudflare R2 media host; resized through Cloudflare Image Transformations. */
const MEDIA_HOST = "media.webnegosyo.com";
const CF_TRANSFORM_PREFIX = "/cdn-cgi/image/";
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

function parseMediaUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    const isMedia =
      parsed.protocol === "https:" &&
      parsed.host === MEDIA_HOST &&
      parsed.username === "" &&
      parsed.password === "";
    return isMedia ? parsed : null;
  } catch {
    return null;
  }
}

/** The object path, without an existing transformation prefix. */
function mediaKey(parsed: URL): string {
  const path = parsed.pathname;
  if (!path.startsWith(CF_TRANSFORM_PREFIX)) return path;
  const rest = path.slice(CF_TRANSFORM_PREFIX.length);
  const slash = rest.indexOf("/");
  return slash < 0 ? "/" : rest.slice(slash);
}

/** `/cdn-cgi/image/<opts>/https://other.host/…` names another origin — never ours. */
const REMOTE_SOURCE = /^\/(https?:|\/)/i;

function mediaThumb(parsed: URL, width: number): string | null {
  // Replace an existing transformation rather than nesting one.
  const key = mediaKey(parsed);
  if (REMOTE_SOURCE.test(key)) return null;
  const options = `width=${width},quality=${QUALITY},format=auto,onerror=redirect`;
  return `${parsed.origin}${CF_TRANSFORM_PREFIX}${options}${key}${parsed.search}`;
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
/**
 * The register tile's thumbnail width in device pixels. A tile is roughly
 * 110pt wide on a phone; 320px covers a 3x panel without asking the CDN for
 * anything larger. Shared so the offline download prefetches the same URL
 * the tile draws.
 */
export const POS_TILE_THUMB_PX = 320;

export function thumbUrl(url: string | null | undefined, size: number): string | null {
  if (!url || url.trim() === "") return null;
  if (!isUsableSize(size)) return url;

  const width = Math.round(size);

  const media = parseMediaUrl(url);
  if (media) return mediaThumb(media, width) ?? url;
  if (url.includes(IMAGEKIT_HOST)) return imagekitThumb(url, width);
  if (url.includes(CLOUDINARY_HOST)) return cloudinaryThumb(url, width);

  // Local file uris, legacy hosts, anything else: leave it alone.
  return url;
}
