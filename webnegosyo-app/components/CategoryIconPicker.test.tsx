/**
 * The sheet where a merchant picks the icon their customers will see.
 *
 * The contract worth pinning is that the sheet is a DRAFT: nothing the merchant
 * taps reaches the category until they apply it, and closing without applying
 * leaves the category exactly as it was. The second is that the two ways to
 * have an icon — the curated library and a pasted emoji — are exclusive, since
 * one column stores both and a leftover emoji would win over the tapped icon.
 */
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react-native";
import { CategoryIconPicker } from "./CategoryIconPicker";

const HIDDEN = { includeHiddenElements: true };

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof CategoryIconPicker>> = {},
) {
  const props = {
    visible: true,
    icon: "",
    color: "",
    onApply: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  render(<CategoryIconPicker {...props} />);
  return props;
}

describe("CategoryIconPicker", () => {
  it("applies the curated icon the merchant tapped", () => {
    const props = renderPicker();

    fireEvent.press(screen.getByTestId("icon-option-coffee"));
    fireEvent.press(screen.getByText("Apply"));

    expect(props.onApply).toHaveBeenCalledWith("lucide:coffee", "");
  });

  it("changes nothing until Apply is pressed", () => {
    const props = renderPicker();

    fireEvent.press(screen.getByTestId("icon-option-coffee"));

    expect(props.onApply).not.toHaveBeenCalled();
  });

  it("discards the draft when the merchant closes without applying", () => {
    const props = renderPicker({ icon: "lucide:pizza" });

    fireEvent.press(screen.getByTestId("icon-option-coffee"));
    fireEvent.press(screen.getByText("Cancel"));

    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("applies a colour the merchant typed alongside the icon", () => {
    const props = renderPicker();

    fireEvent.changeText(screen.getByTestId("icon-color-input"), "#FF6B00");
    fireEvent.press(screen.getByTestId("icon-option-coffee"));
    fireEvent.press(screen.getByText("Apply"));

    expect(props.onApply).toHaveBeenCalledWith("lucide:coffee", "#FF6B00");
  });

  it("refuses a colour that is not a hex value rather than saving it", () => {
    const props = renderPicker();

    fireEvent.changeText(screen.getByTestId("icon-color-input"), "red");
    fireEvent.press(screen.getByTestId("icon-option-coffee"));
    fireEvent.press(screen.getByText("Apply"));

    expect(props.onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/hex colour/i)).toBeTruthy();
  });

  it("narrows the grid to the typed search", () => {
    renderPicker();

    fireEvent.changeText(screen.getByTestId("icon-search-input"), "coffee");

    expect(screen.getByTestId("icon-option-coffee")).toBeTruthy();
    expect(screen.queryByTestId("icon-option-pizza")).toBeNull();
  });

  it("says so when nothing matches instead of showing an empty grid", () => {
    renderPicker();

    fireEvent.changeText(screen.getByTestId("icon-search-input"), "zzzz");

    expect(screen.getByText(/no icons match/i)).toBeTruthy();
  });

  it("narrows the grid to the tapped group", () => {
    renderPicker();

    fireEvent.press(screen.getByText("Drinks"));

    expect(screen.getByTestId("icon-option-cup-soda")).toBeTruthy();
    expect(screen.queryByTestId("icon-option-pizza")).toBeNull();
  });

  it("applies a pasted emoji for merchants who prefer one", () => {
    const props = renderPicker();

    fireEvent.press(screen.getByTestId("icon-emoji-toggle"));
    fireEvent.changeText(screen.getByTestId("icon-emoji-input"), "🍜");
    fireEvent.press(screen.getByText("Apply"));

    expect(props.onApply).toHaveBeenCalledWith("🍜", "");
  });

  it("drops a previously typed emoji when a curated icon is tapped", () => {
    const props = renderPicker();

    fireEvent.press(screen.getByTestId("icon-emoji-toggle"));
    fireEvent.changeText(screen.getByTestId("icon-emoji-input"), "🍜");
    fireEvent.press(screen.getByTestId("icon-emoji-toggle"));
    fireEvent.press(screen.getByTestId("icon-option-coffee"));
    fireEvent.press(screen.getByText("Apply"));

    expect(props.onApply).toHaveBeenCalledWith("lucide:coffee", "");
  });

  it("clears the icon back to none", () => {
    const props = renderPicker({ icon: "lucide:coffee" });

    fireEvent.press(screen.getByText("Clear"));
    fireEvent.press(screen.getByText("Apply"));

    expect(props.onApply).toHaveBeenCalledWith("", "");
  });

  it("opens showing the icon the category already has", () => {
    renderPicker({ icon: "lucide:pizza", color: "#FF6B00" });

    const preview = within(screen.getByTestId("icon-preview"));
    expect(preview.getByTestId("category-icon-pizza", HIDDEN)).toBeTruthy();
    expect(screen.getByTestId("icon-color-input").props.value).toBe("#FF6B00");
  });
});
