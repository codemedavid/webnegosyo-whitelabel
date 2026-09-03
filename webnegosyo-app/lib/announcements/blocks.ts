// Platform "What's New" content model — a synced copy of
// `src/lib/announcements/blocks.ts` on the web (which validates with zod; the
// app has no zod, so the same rules are written by hand). Change both.
//
// A post body is an ordered list of typed blocks, never HTML, so nothing an
// author typed is ever interpreted as markup on the phone. Every stored body
// is re-validated here before it is drawn: a row that fails is shown as
// "couldn't load" rather than crashing the screen.

export type AnnouncementKind = "post" | "notice";

export type AnnouncementBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "image"; url: string; caption?: string }
  | { type: "video"; url: string; caption?: string }
  | { type: "embed"; url: string; caption?: string };

export type VideoEmbedProvider = "youtube" | "vimeo";

export interface VideoEmbed {
  provider: VideoEmbedProvider;
  videoId: string;
  /** The page to open — the app has no in-app player yet. */
  watchUrl: string;
  thumbnailUrl: string | null;
}

const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_BLOCK_LENGTH = 5000;
const MAX_CAPTION_LENGTH = 500;
const MAX_BLOCKS = 60;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^\d{5,15}$/;

function youtubeIdFrom(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  const fromQuery = url.searchParams.get("v");
  if (fromQuery) return fromQuery;
  const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
  return match ? match[1] : null;
}

function vimeoIdFrom(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const match = url.pathname.match(/(\d+)/);
  return match ? match[1] : null;
}

/** The hosted video a link points at, or null when it is not one we support. */
export function resolveVideoEmbed(input: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const youtubeId = youtubeIdFrom(url);
  if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
    return {
      provider: "youtube",
      videoId: youtubeId,
      watchUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  const vimeoId = vimeoIdFrom(url);
  if (vimeoId && VIMEO_ID.test(vimeoId)) {
    return {
      provider: "vimeo",
      videoId: vimeoId,
      watchUrl: `https://vimeo.com/${vimeoId}`,
      thumbnailUrl: null,
    };
  }

  return null;
}

type BlockParse = { ok: true; block: AnnouncementBlock } | { ok: false; error: string };

function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function readHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

function readCaption(value: unknown): { ok: true; caption?: string } | { ok: false } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "string" || value.trim().length > MAX_CAPTION_LENGTH) return { ok: false };
  return { ok: true, caption: value.trim() };
}

function parseMediaBlock(
  type: "image" | "video" | "embed",
  raw: Record<string, unknown>,
  index: number
): BlockParse {
  const url = readHttpsUrl(raw.url);
  if (!url) return { ok: false, error: `${index}: ${type} needs an https url` };
  if (type === "embed" && resolveVideoEmbed(url) === null) {
    return { ok: false, error: `${index}: only YouTube and Vimeo links are supported` };
  }
  const caption = readCaption(raw.caption);
  if (!caption.ok) return { ok: false, error: `${index}: caption too long` };
  return {
    ok: true,
    block: caption.caption !== undefined ? { type, url, caption: caption.caption } : { type, url },
  };
}

function parseBlock(raw: unknown, index: number): BlockParse {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: `${index}: not a block` };
  }
  const record = raw as Record<string, unknown>;
  switch (record.type) {
    case "heading": {
      const text = readText(record.text, MAX_TITLE_LENGTH);
      return text ? { ok: true, block: { type: "heading", text } } : { ok: false, error: `${index}: empty heading` };
    }
    case "paragraph": {
      const text = readText(record.text, MAX_TEXT_BLOCK_LENGTH);
      return text ? { ok: true, block: { type: "paragraph", text } } : { ok: false, error: `${index}: empty paragraph` };
    }
    case "image":
    case "video":
    case "embed":
      return parseMediaBlock(record.type, record, index);
    default:
      return { ok: false, error: `${index}: unknown block type` };
  }
}

export type BlocksParseResult =
  | { ok: true; blocks: AnnouncementBlock[] }
  | { ok: false; error: string };

/** The blocks a stored body contains, or why it cannot be shown. */
export function parseAnnouncementBlocks(input: unknown): BlocksParseResult {
  if (!Array.isArray(input)) return { ok: false, error: "body is not a list of blocks" };
  if (input.length > MAX_BLOCKS) return { ok: false, error: "too many blocks" };
  const blocks: AnnouncementBlock[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const parsed = parseBlock(input[index], index);
    if (!parsed.ok) return parsed;
    blocks.push(parsed.block);
  }
  return { ok: true, blocks };
}
