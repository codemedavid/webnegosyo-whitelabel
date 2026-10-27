import fs from "fs";
import path from "path";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { expenseUndoStore, type UndoEntry } from "../../stores/expense-undo-store";
import { spacing } from "../../theme/colors";
import { ExpenseUndoBar, ROUTES_WITHOUT_TAB_BAR, TAB_BAR_CONTENT_HEIGHT, undoBarBottom } from "./ExpenseUndoHost";

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

describe("Repeat on the undo bar", () => {
  function entry(id: string, offer: UndoEntry["offer"]): UndoEntry {
    return {
      id,
      message: "Saved · Rent ₱15,000",
      offer,
      commit: jest.fn(async () => {}),
      undo: jest.fn(async () => ({ status: "undone" as const })),
    };
  }

  const repeat = {
    label: "Repeat",
    message: "Saved · Rent ₱15,000 · Pay this every month?",
    href: "/(main)/expense-bills?new=1&category=cat-rent&amount=1500000&day=5&name=Rent",
  };

  afterEach(() => {
    const current = expenseUndoStore.getState().current;
    if (current) act(() => expenseUndoStore.getState().commit(current.id));
  });

  it("asks to pay it every month and opens the bill editor, keeping Undo", () => {
    // Arrange
    const navigate = jest.fn();
    act(() => expenseUndoStore.getState().show(entry("r-repeat-1", repeat)));
    render(<ExpenseUndoBar onNavigate={navigate} />);

    // Act
    expect(screen.getByText("Saved · Rent ₱15,000 · Pay this every month?")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Repeat" }));

    // Assert
    expect(navigate).toHaveBeenCalledWith(repeat.href);
    expect(screen.queryByRole("button", { name: "Repeat" })).toBeNull();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.getByText("Saved · Rent ₱15,000")).toBeTruthy();
  });

  it("Undo still takes the expense back while Repeat is offered", async () => {
    const saved = entry("r-repeat-2", repeat);
    act(() => expenseUndoStore.getState().show(saved));
    render(<ExpenseUndoBar onNavigate={jest.fn()} />);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Undo" }));
    });

    expect(saved.undo).toHaveBeenCalledTimes(1);
    expect(saved.commit).not.toHaveBeenCalled();
  });

  it("an ordinary save shows only Undo", () => {
    act(() => expenseUndoStore.getState().show(entry("r-plain", null)));
    render(<ExpenseUndoBar onNavigate={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Repeat" })).toBeNull();
    expect(screen.getByText("Saved · Rent ₱15,000")).toBeTruthy();
  });
});
