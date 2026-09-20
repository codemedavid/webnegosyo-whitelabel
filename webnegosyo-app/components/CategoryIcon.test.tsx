/**
 * A category's icon, as the merchant app draws it.
 *
 * The stored value has two shapes — a curated `lucide:<name>` and, for stores
 * set up before the icon library existed, a raw emoji — and both have to render
 * here exactly as they do on the storefront. The third case matters just as
 * much: a name this build does not know must fall back to something visible,
 * because rendering nothing is indistinguishable from the category having no
 * icon at all and sends the merchant looking for a bug in their data.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { CategoryIcon } from "./CategoryIcon";

const HIDDEN = { includeHiddenElements: true };

describe("CategoryIcon", () => {
  it("draws a curated lucide icon", () => {
    render(<CategoryIcon icon="lucide:coffee" color="#FF6B00" />);

    expect(screen.getByTestId("category-icon-coffee", HIDDEN)).toBeTruthy();
  });

  it("renders a raw emoji as text, the way stores set up before the library have it", () => {
    render(<CategoryIcon icon="🍜" />);

    expect(screen.getByText("🍜", HIDDEN)).toBeTruthy();
  });

  it("falls back visibly when it has never heard of the icon", () => {
    render(<CategoryIcon icon="lucide:not-an-icon" fallback="placeholder" />);

    expect(screen.getByTestId("category-icon-placeholder")).toBeTruthy();
  });

  it("renders nothing for a category with no icon", () => {
    const { toJSON } = render(<CategoryIcon icon="" />);

    expect(toJSON()).toBeNull();
  });

  it("offers a placeholder for a category with no icon when one is asked for", () => {
    render(<CategoryIcon icon={null} fallback="placeholder" />);

    expect(screen.getByTestId("category-icon-placeholder")).toBeTruthy();
  });

  it("is invisible to assistive tech: the category's name is already read out", () => {
    render(<CategoryIcon icon="lucide:coffee" />);

    expect(screen.getByTestId("category-icon-coffee", HIDDEN).props.accessibilityElementsHidden).toBe(true);
  });
});
