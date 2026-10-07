import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { collectChips, conversationIdOf, readRefusal, userPhotosOf, userTextOf, GENERIC_ERROR, TOOL_LABELS } from "./presentation";
import { resolveOwlLink } from "./links";
import { isOwlAvailable, shouldShowOwlButton } from "./visibility";
import type { AssistantMessage } from "./types";

const WEB = "https://www.webnegosyo.com";

function toolPart(toolCallId: string, chips: Array<{ label: string; prompt: string }>, state = "output-available") {
  return { type: "tool-get_sales_overview", toolCallId, state, output: { facts: {}, chips } } as const;
}

describe("collectChips", () => {
  test("gathers chips from finished tools, de-duplicated by prompt, at most four", () => {
    const message: AssistantMessage = {
      id: "a",
      role: "assistant",
      parts: [
        toolPart("1", [{ label: "A", prompt: "a" }, { label: "B", prompt: "b" }]),
        toolPart("2", [{ label: "A again", prompt: "a" }, { label: "C", prompt: "c" }, { label: "D", prompt: "d" }, { label: "E", prompt: "e" }]),
        toolPart("3", [{ label: "F", prompt: "f" }], "input-available"),
      ],
    };
    expect(collectChips(message).map((chip) => chip.label)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("message helpers", () => {
  test("conversationIdOf reads the newest stamped id", () => {
    const messages: AssistantMessage[] = [
      { id: "1", role: "assistant", parts: [], metadata: { conversationId: "old" } },
      { id: "2", role: "user", parts: [] },
      { id: "3", role: "assistant", parts: [], metadata: { conversationId: "new" } },
    ];
    expect(conversationIdOf(messages)).toBe("new");
    expect(conversationIdOf([])).toBeNull();
  });

  test("userTextOf joins text parts", () => {
    expect(userTextOf({ id: "u", role: "user", parts: [{ type: "text", text: "hi" }, { type: "text", text: "there" }] })).toBe("hi there");
  });

  test("readRefusal surfaces the server's sentence or a generic one", () => {
    expect(readRefusal({ error: "Your store has used today’s assistant allowance." })).toBe("Your store has used today’s assistant allowance.");
    expect(readRefusal({ nope: 1 })).toBe(GENERIC_ERROR);
    expect(readRefusal(null)).toBe(GENERIC_ERROR);
  });
});

describe("resolveOwlLink", () => {
  test("every path the web tools emit lands on an app screen, except web-only Boost Sales", () => {
    expect(resolveOwlLink("", "seacook", WEB)).toEqual({ kind: "app", href: "/(main)/dashboard" });
    expect(resolveOwlLink("/inventory", "seacook", WEB)).toEqual({ kind: "app", href: "/(main)/inventory" });
    expect(resolveOwlLink("/staff", "seacook", WEB)).toEqual({ kind: "app", href: "/(main)/team" });
    expect(resolveOwlLink("/customers", "seacook", WEB)).toEqual({ kind: "app", href: "/(main)/customers" });
    expect(resolveOwlLink("/vouchers", "seacook", WEB)).toEqual({ kind: "app", href: "/(main)/vouchers" });
    expect(resolveOwlLink("/menu", "seacook", WEB)).toEqual({ kind: "app", href: "/(main)/product-management" });
    expect(resolveOwlLink("/loyalty", "seacook", WEB)).toEqual({ kind: "app", href: "/(main)/loyalty" });
    expect(resolveOwlLink("/orders", "seacook", WEB)).toEqual({ kind: "app", href: "/(main)/orders" });
    expect(resolveOwlLink("/menu/0b6c1f8e-4b1a-4c3e-9d2a-1234567890ab", "seacook", WEB)).toEqual({
      kind: "app",
      href: "/(main)/product/0b6c1f8e-4b1a-4c3e-9d2a-1234567890ab",
    });
    expect(resolveOwlLink("/boost-sales", "seacook", WEB)).toEqual({ kind: "web", url: `${WEB}/seacook/admin/boost-sales` });
  });

  test("never builds an off-platform or malformed link", () => {
    expect(resolveOwlLink("https://evil.example", "seacook", WEB)).toBeNull();
    expect(resolveOwlLink("/x?y=<script>", "seacook", WEB)).toBeNull();
    expect(resolveOwlLink("/boost-sales", null, WEB)).toBeNull();
  });
});

describe("owl visibility", () => {
  const base = { isAuthenticated: true, isDemo: false, tenantId: "t", assistantEnabled: true, outletId: null, routeSegments: ["(main)", "dashboard"] };

  test("shows for a store-wide account on a store with the assistant on", () => {
    expect(shouldShowOwlButton(base)).toBe(true);
  });

  test("hidden when off, in demo, signed out, branch-locked or tenant-less", () => {
    expect(isOwlAvailable({ ...base, assistantEnabled: false })).toBe(false);
    expect(isOwlAvailable({ ...base, isDemo: true })).toBe(false);
    expect(isOwlAvailable({ ...base, isAuthenticated: false })).toBe(false);
    expect(isOwlAvailable({ ...base, outletId: "branch-1" })).toBe(false);
    expect(isOwlAvailable({ ...base, tenantId: null })).toBe(false);
  });

  test("stays off the register, tender, kitchen and scanner", () => {
    for (const screen of ["pos", "pos-tender", "kitchen", "scan"]) {
      expect(shouldShowOwlButton({ ...base, routeSegments: ["(main)", screen] })).toBe(false);
    }
    expect(shouldShowOwlButton({ ...base, routeSegments: ["(main)", "reports"] })).toBe(true);
  });

  test("stays off detail and editor screens, whose Save bar sits where it floats", () => {
    expect(shouldShowOwlButton({ ...base, routeSegments: ["(main)", "product", "[productId]"] })).toBe(false);
    expect(shouldShowOwlButton({ ...base, routeSegments: ["(main)", "voucher", "[voucherId]"] })).toBe(false);
  });
});

/**
 * The web registers the tools; the app only labels them. A tool added on the
 * web without a label here would show the generic "Working on it…" on phones,
 * and a link without an app screen would bounce the owner to the browser.
 */
describe("parity with the web assistant", () => {
  const WEB_TOOLS_DIR = join(__dirname, "..", "..", "..", "src", "lib", "assistant", "tools");

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : [],
    );
  }

  const sources = sourceFiles(WEB_TOOLS_DIR).map((file) => readFileSync(file, "utf8"));

  test("every web tool has an app label", () => {
    const names = sources.flatMap((source) => [...source.matchAll(/^\s+name: '([a-z_]+)',$/gm)].map((match) => match[1]));

    expect(names.length).toBeGreaterThan(20);
    for (const name of names) expect(TOOL_LABELS[name]).toBeDefined();
  });

  test("every link a web tool writes opens an app screen or the web admin", () => {
    const paths = new Set(sources.flatMap((source) => [...source.matchAll(/path: '(\/[a-z-]*)'/g)].map((match) => match[1])));

    for (const path of paths) expect(resolveOwlLink(path, "seacook", WEB)).not.toBeNull();
    expect(resolveOwlLink("/loyalty", "seacook", WEB)).toMatchObject({ kind: "app" });
  });
});

describe("userPhotosOf", () => {
  test("shows the photos sent this session, and only a count for a reopened chat", () => {
    const sent = { id: "u", role: "user" as const, parts: [{ type: "text", text: "hi" }, { type: "file", mediaType: "image/jpeg", url: "data:image/jpeg;base64,AA" }] };
    const reopened = { id: "u", role: "user" as const, parts: [{ type: "text", text: "hi" }, { type: "data-photos", data: { count: 2 } }] };

    expect(userPhotosOf(sent)).toEqual({ urls: ["data:image/jpeg;base64,AA"], count: 1 });
    expect(userPhotosOf(reopened)).toEqual({ urls: [], count: 2 });
    expect(userPhotosOf({ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] })).toEqual({ urls: [], count: 0 });
  });
});
