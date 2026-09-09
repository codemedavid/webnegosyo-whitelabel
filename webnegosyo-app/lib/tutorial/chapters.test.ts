/**
 * Registry integrity. A chapter that gates on a tab nobody has, or a step that
 * names a scene nobody built, would ship as a blank screen; these catch both
 * at build time. Scene coverage is checked against the registry's source so
 * the components project need not render anything here.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TUTORIAL_CHAPTERS, getChapter } from "./chapters";
import { WORKSPACES } from "../workspaces";

const KNOWN_TABS = new Set(WORKSPACES.flatMap((w) => w.tabs));

describe("TUTORIAL_CHAPTERS", () => {
  it("has unique chapter and step ids", () => {
    const ids = TUTORIAL_CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chapter of TUTORIAL_CHAPTERS) {
      const stepIds = chapter.steps.map((s) => s.id);
      expect(new Set(stepIds).size).toBe(stepIds.length);
      expect(chapter.steps.length).toBeGreaterThan(0);
    }
  });

  it("gates only on tabs the workspace registry knows", () => {
    for (const chapter of TUTORIAL_CHAPTERS) {
      if (chapter.gateTab !== null) expect(KNOWN_TABS.has(chapter.gateTab)).toBe(true);
    }
  });

  it("sends the merchant somewhere real when a chapter ends", () => {
    for (const chapter of TUTORIAL_CHAPTERS) {
      if (!chapter.destination) continue;
      expect(chapter.destination.href.startsWith("/(main)/")).toBe(true);
      expect(chapter.destination.label.length).toBeGreaterThan(0);
    }
  });

  it("gives every step a prompt and a result, so nothing is a dead illustration", () => {
    for (const chapter of TUTORIAL_CHAPTERS) {
      for (const step of chapter.steps) {
        expect(step.prompt).toBeTruthy();
        expect(step.result).toBeTruthy();
      }
    }
  });

  it("only plays scenes that are built, in phases they know", () => {
    const registry = readFileSync(
      join(__dirname, "../../components/tutorial/scenes/index.tsx"),
      "utf8",
    );
    const builtKinds = new Set(
      [...registry.matchAll(/^\s+([a-zA-Z]+):\s+\w+Scene,?$/gm)].map((m) => m[1]),
    );
    for (const chapter of TUTORIAL_CHAPTERS) {
      for (const step of chapter.steps) {
        expect(builtKinds.has(step.scene.kind)).toBe(true);
        const sceneSource = readFileSync(
          join(__dirname, `../../components/tutorial/scenes/${capitalize(step.scene.kind)}Scene.tsx`),
          "utf8",
        );
        expect(sceneSource).toContain(`"${step.scene.phase}"`);
      }
    }
  });

  it("places the coach card on every step", () => {
    for (const chapter of TUTORIAL_CHAPTERS) {
      for (const step of chapter.steps) expect(["top", "bottom"]).toContain(step.coach);
    }
  });

  it("looks a chapter up by id", () => {
    expect(getChapter("orders")?.title).toBe("Your first order");
    expect(getChapter("nope")).toBeUndefined();
  });
});

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
