import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { makeBillItem } from "../../../lib/expenses/expenses-home-needs";
import { NeedsYouCard } from "./NeedsYouCard";

const kuryente = makeBillItem({ categoryId: "cat-power", name: "Kuryente", typicalDay: 24, typicalCents: 620_000, monthNames: ["August", "September"] });

describe("NeedsYouCard: Make it a bill?", () => {
  test("asks with both answers, and each does its own thing", () => {
    // Arrange
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    render(<NeedsYouCard items={[kuryente]} onAction={onAction} onDismiss={onDismiss} />);

    // Act
    fireEvent.press(screen.getByRole("button", { name: "Make it a bill" }));
    fireEvent.press(screen.getByRole("button", { name: "Not now" }));

    // Assert
    expect(screen.getByText("Kuryente comes every month")).toBeTruthy();
    expect(screen.getByText("You paid it around the 24th in August and September. Want a reminder?")).toBeTruthy();
    expect(onAction).toHaveBeenCalledWith(kuryente);
    expect(onDismiss).toHaveBeenCalledWith(kuryente);
  });

  test("without a dismiss handler it shows only the main button", () => {
    render(<NeedsYouCard items={[kuryente]} onAction={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Not now" })).toBeNull();
    expect(screen.getByRole("button", { name: "Make it a bill" })).toBeTruthy();
  });
});
