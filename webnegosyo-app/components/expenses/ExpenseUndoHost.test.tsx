import fs from "fs";
import path from "path";

import { spacing } from "../../theme/colors";
import { ROUTES_WITHOUT_TAB_BAR, TAB_BAR_CONTENT_HEIGHT, undoBarBottom } from "./ExpenseUndoHost";

jest.mock("expo-router", () => ({ useSegments: () => [] }));

const LAYOUT = path.join(__dirname, "../../app/(main)/_layout.tsx");

/** Every (main) route the layout registers with the tab bar hidden. */
function hiddenTabBarRoutes(source: string): string[] {
  const screens = source.split("<Tabs.Screen").slice(1);
  return screens
    .filter((screen) => /tabBarStyle:\s*\{\s*display:\s*"none"\s*\}/.test(screen.split("/>")[0]))
    .map((screen) => /name="([^"]+)"/.exec(screen)?.[1] ?? "")
    .filter(Boolean)
    .sort();
}

describe("where the undo bar sits", () => {
  it("knows every screen the layout shows without a tab bar", () => {
    // Arrange
    const source = fs.readFileSync(LAYOUT, "utf8");

    // Act
    const hidden = hiddenTabBarRoutes(source);

    // Assert
    expect(hidden.length).toBeGreaterThan(0);
    expect([...ROUTES_WITHOUT_TAB_BAR].sort()).toEqual(hidden);
  });

  it("docks above the tab bar on a tab screen", () => {
    expect(undoBarBottom(["(main)", "expenses"], 34)).toBe(TAB_BAR_CONTENT_HEIGHT + 34 + spacing.sm);
  });

  it("drops to the home indicator on a screen without a tab bar, instead of floating mid-air", () => {
    expect(undoBarBottom(["(main)", "receipt-editor"], 34)).toBe(34 + spacing.sm);
    expect(undoBarBottom(["(main)", "tutorial", "[chapterId]"], 0)).toBe(spacing.sm + spacing.sm);
  });
});
