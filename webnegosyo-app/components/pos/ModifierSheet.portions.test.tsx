/**
 * Add-on amounts in the register's option picker.
 *
 * An add-on group (web "Add-ons" mode) gets a − n + stepper per add-on, the
 * way web checkout does, so "Fried Rice ×2" is one tap more than "Fried Rice"
 * instead of a second line. Pick-from-a-list groups keep their tap-to-choose.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ModifierSheet } from "./ModifierSheet";
import { normalizeModifierGroups, type ModifierGroup } from "../../lib/modifier-groups";
import type { OrderTypePricing } from "../../lib/order-type-pricing";
import type { PosCartSelection } from "../../lib/pos-cart";

const ADDONS: ModifierGroup = {
  id: "g-addons",
  name: "Add-ons",
  selection_mode: "quantity",
  display_order: 0,
  min_select: 0,
  max_select: 3,
  options: [
    { id: "o-rice", name: "Fried Rice", price_modifier: 15, display_order: 0 },
    { id: "o-egg", name: "Egg", price_modifier: 20, display_order: 1 },
  ],
};

const SIZE: ModifierGroup = {
  id: "g-size",
  name: "Size",
  display_order: 1,
  min_select: 0,
  max_select: 1,
  options: [{ id: "o-large", name: "Large", price_modifier: 10, display_order: 0 }],
};

function renderSheet(pricing: OrderTypePricing | null = null) {
  const onConfirm = jest.fn();
  render(
    <ModifierSheet
      visible
      itemName="Adobo"
      basePrice={100}
      groups={[ADDONS, SIZE]}
      pricing={pricing}
      onCancel={() => {}}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

const more = (name: string) => screen.getByLabelText(`Add one ${name}`);
const less = (name: string) => screen.getByLabelText(`Remove one ${name}`);
const confirmed = (onConfirm: jest.Mock) => onConfirm.mock.calls[0] as [PosCartSelection[], number];

describe("ModifierSheet add-on amounts", () => {
  it("shows the group's portion rule", () => {
    renderSheet();
    expect(screen.getByText("Optional — up to 3 portions")).toBeTruthy();
  });

  it("adds portions with the + button and prices every one", () => {
    const onConfirm = renderSheet();
    fireEvent.press(more("Fried Rice"));
    fireEvent.press(more("Fried Rice"));

    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Add ₱130.00")).toBeTruthy();

    fireEvent.press(screen.getByText(/^Add ₱/));
    const [selections, quantity] = confirmed(onConfirm);
    expect(quantity).toBe(1);
    expect(selections).toEqual([
      expect.objectContaining({ optionId: "o-rice", portions: 2, priceModifier: 30, listPriceModifier: 30 }),
    ]);
  });

  it("adds the first portion when the add-on's name is tapped", () => {
    renderSheet();
    fireEvent.press(screen.getByText("Fried Rice"));
    expect(screen.getByText("Add ₱115.00")).toBeTruthy();
  });

  it("takes portions away and drops the add-on at zero", () => {
    const onConfirm = renderSheet();
    fireEvent.press(more("Egg"));
    fireEvent.press(more("Egg"));
    fireEvent.press(less("Egg"));
    fireEvent.press(less("Egg"));

    expect(screen.getByText("Add ₱100.00")).toBeTruthy();
    fireEvent.press(screen.getByText(/^Add ₱/));
    expect(confirmed(onConfirm)[0]).toEqual([]);
  });

  it("stops at the group's limit across all its add-ons", () => {
    renderSheet();
    fireEvent.press(more("Egg"));
    fireEvent.press(more("Egg"));
    fireEvent.press(more("Fried Rice"));
    fireEvent.press(more("Fried Rice"));

    // 3 portions max: ₱100 + 2 × ₱20 + 1 × ₱15.
    expect(screen.getByText("Add ₱155.00")).toBeTruthy();
    expect(more("Fried Rice").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("marks up each portion for the channel", () => {
    renderSheet({ orderTypeId: "ot-grab", markupPercent: 20, itemPrices: {} });
    fireEvent.press(more("Fried Rice"));
    fireEvent.press(more("Fried Rice"));
    // ₱15 → ₱18 per portion on the channel.
    expect(screen.getByText("Add ₱136.00")).toBeTruthy();
  });

  it("keeps tap-to-choose for a pick-from-a-list group", () => {
    renderSheet();
    expect(screen.queryByLabelText("Add one Large")).toBeNull();
    fireEvent.press(screen.getByText(/Large/));
    expect(screen.getByText("Add ₱110.00")).toBeTruthy();
  });

  it("keeps the stepper on an add-on group capped at one portion", () => {
    const onConfirm = jest.fn();
    render(
      <ModifierSheet
        visible
        itemName="Adobo"
        basePrice={100}
        groups={[{ ...ADDONS, max_select: 1 }]}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.press(more("Egg"));
    expect(more("Fried Rice").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText("Optional — up to 1 portions")).toBeTruthy();
  });

  it("stops at an add-on's own stock count and refuses a sold-out one", () => {
    const counted: ModifierGroup = {
      ...ADDONS,
      max_select: null,
      options: [
        { id: "o-rice", name: "Fried Rice", price_modifier: 15, display_order: 0, stock_mode: "simple", stock_qty: 2 },
        { id: "o-egg", name: "Egg", price_modifier: 20, display_order: 1, is_available: false },
      ],
    };
    render(
      <ModifierSheet visible itemName="Adobo" basePrice={100} groups={[counted]} onCancel={() => {}} onConfirm={jest.fn()} />,
    );
    fireEvent.press(more("Fried Rice"));
    fireEvent.press(more("Fried Rice"));
    expect(more("Fried Rice").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText("Sold out")).toBeTruthy();
    expect(more("Egg").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("gives a dish's old-style add-on list the stepper too", () => {
    const [legacy] = normalizeModifierGroups({ addons: [{ id: "a-egg", name: "Egg", price: 20 }] });
    const onConfirm = jest.fn();
    render(
      <ModifierSheet visible itemName="Adobo" basePrice={100} groups={[legacy]} onCancel={() => {}} onConfirm={onConfirm} />,
    );
    fireEvent.press(more("Egg"));
    fireEvent.press(more("Egg"));
    fireEvent.press(more("Egg"));
    expect(screen.getByText("Add ₱160.00")).toBeTruthy();
  });
});

describe("ModifierSheet pick-several groups (web product page parity)", () => {
  const SAUCES: ModifierGroup = {
    id: "g-sauce",
    name: "Sauces",
    display_order: 0,
    min_select: 1,
    max_select: 2,
    options: [
      { id: "s-gravy", name: "Gravy", price_modifier: 0, display_order: 0 },
      { id: "s-garlic", name: "Garlic", price_modifier: 5, display_order: 1 },
      { id: "s-chili", name: "Chili", price_modifier: 5, display_order: 2 },
    ],
  };

  it("shows the rule and live progress, and greys out the rest once full", () => {
    render(
      <ModifierSheet visible itemName="Chicken" basePrice={100} groups={[SAUCES]} onCancel={() => {}} onConfirm={jest.fn()} />,
    );
    expect(screen.getByText("Required — choose 1 to 2")).toBeTruthy();
    expect(screen.getByText("1 more to go")).toBeTruthy();

    fireEvent.press(screen.getByText(/Gravy/));
    fireEvent.press(screen.getByText(/Garlic/));
    expect(screen.getByText("2 of 2 selected")).toBeTruthy();

    const chili = screen.getByRole("button", { name: /Chili/ });
    expect(chili.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText("Add ₱105.00")).toBeTruthy();
  });

  it("starts a required single choice on its first available option", () => {
    const size: ModifierGroup = {
      id: "g-size",
      name: "Size",
      display_order: 0,
      min_select: 1,
      max_select: 1,
      options: [
        { id: "z-reg", name: "Regular", price_modifier: 0, display_order: 0 },
        { id: "z-big", name: "Large", price_modifier: 30, display_order: 1 },
      ],
    };
    const onConfirm = jest.fn();
    render(
      <ModifierSheet visible itemName="Coffee" basePrice={100} groups={[size]} onCancel={() => {}} onConfirm={onConfirm} />,
    );
    fireEvent.press(screen.getByText(/^Add /));
    expect((onConfirm.mock.calls[0] as [PosCartSelection[], number])[0].map((s) => s.optionId)).toEqual(["z-reg"]);
  });
});
