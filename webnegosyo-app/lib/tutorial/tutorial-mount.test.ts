/**
 * Source-level guardrails for the tutorial's wiring. Screens are not rendered
 * under Jest here, so these assert on the files: the two routes are
 * registered off the bar, the greeter is mounted once in the tab layout, and
 * both the Menu hub and Account link to the chapter list — otherwise the tour
 * exists but nobody can reach it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(__dirname, "../..", rel), "utf8");

describe("tutorial wiring", () => {
  const layout = read("app/(main)/_layout.tsx");

  it("registers both tutorial routes off the tab bar", () => {
    expect(layout).toMatch(/name="tutorial\/index"\s+options=\{\{ href: null/);
    expect(layout).toMatch(/name="tutorial\/\[chapterId\]"\s+options=\{\{ href: null/);
  });

  it("hides the real tab bar under the chapter, which draws its own", () => {
    expect(layout).toMatch(/name="tutorial\/\[chapterId\]"[\s\S]{0,120}tabBarStyle: \{ display: "none" \}/);
  });

  it("mounts the greeter once beside the What's New popup", () => {
    expect(layout.match(/<TutorialWelcomePopup \/>/g)).toHaveLength(1);
  });

  it("links to the chapter list from the Menu hub and Account", () => {
    expect(read("app/(main)/menu.tsx")).toContain("router.push(TUTORIAL_HUB_ROUTE)");
    expect(read("app/(main)/account.tsx")).toContain("router.push(TUTORIAL_HUB_ROUTE)");
  });

  it("has a route file for each registered tutorial screen", () => {
    expect(() => read("app/(main)/tutorial/index.tsx")).not.toThrow();
    expect(() => read("app/(main)/tutorial/[chapterId].tsx")).not.toThrow();
  });
});
