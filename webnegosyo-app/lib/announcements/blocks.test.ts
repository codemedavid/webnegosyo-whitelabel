// Synced copy of the web content model (src/lib/announcements/blocks.ts).
// The phone re-validates every stored body before drawing it: a row the web
// composer accepted is a row the app can render, and a row anyone else
// managed to write is refused rather than crashed on.

import { parseAnnouncementBlocks, resolveVideoEmbed } from "./blocks";

describe("parseAnnouncementBlocks (app copy)", () => {
  it("accepts every block type in order", () => {
    const result = parseAnnouncementBlocks([
      { type: "heading", text: "Kitchen Display" },
      { type: "paragraph", text: "Chits print price-free." },
      { type: "image", url: "https://ik.imagekit.io/x/kds.png", caption: "Board" },
      { type: "video", url: "https://ik.imagekit.io/x/kds.mp4" },
      { type: "embed", url: "https://youtu.be/abc123DEF45" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "image",
      "video",
      "embed",
    ]);
  });

  it("refuses unknown block types, non-https media, and non-arrays", () => {
    expect(parseAnnouncementBlocks([{ type: "html", html: "<b>x</b>" }]).ok).toBe(false);
    expect(parseAnnouncementBlocks([{ type: "image", url: "http://x/y.png" }]).ok).toBe(false);
    expect(parseAnnouncementBlocks([{ type: "embed", url: "https://example.com/v" }]).ok).toBe(
      false
    );
    expect(parseAnnouncementBlocks("nope").ok).toBe(false);
    expect(parseAnnouncementBlocks(null).ok).toBe(false);
  });

  it("refuses empty text", () => {
    expect(parseAnnouncementBlocks([{ type: "paragraph", text: "  " }]).ok).toBe(false);
  });
});

describe("resolveVideoEmbed (app copy)", () => {
  it("resolves youtube with a thumbnail", () => {
    expect(resolveVideoEmbed("https://www.youtube.com/watch?v=abc123DEF45")).toEqual({
      provider: "youtube",
      videoId: "abc123DEF45",
      watchUrl: "https://www.youtube.com/watch?v=abc123DEF45",
      thumbnailUrl: "https://img.youtube.com/vi/abc123DEF45/hqdefault.jpg",
    });
  });

  it("resolves vimeo without a thumbnail and rejects the rest", () => {
    expect(resolveVideoEmbed("https://vimeo.com/123456789")?.provider).toBe("vimeo");
    expect(resolveVideoEmbed("https://example.com")).toBeNull();
  });
});
