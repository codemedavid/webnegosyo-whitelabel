/**
 * The typed amount never runs off the sheet: the size steps down by length,
 * large accessibility text is capped, and the row grows instead of clipping.
 */
import React from "react";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { AMOUNT_MAX_FONT_SCALE, ExpenseAmount, amountDigitSize } from "./ExpenseAmount";
import { sheetSizing } from "./ExpenseKeypad";

/** The sheet's side padding (`spacing.xl` each side). */
const SHEET_GUTTER = 20 * 2;
/** Conservative glyph widths in em for an 800-weight tabular font. */
const DIGIT_EM = 0.62;
const PUNCTUATION_EM = 0.3;
const PESO_EM = 0.65;
const SYMBOL_SCALE = 0.55;
const ROW_EXTRAS = 4 * 2 + 3;

/** The widest amount of each length the keypad allows (₱10,000,000.00 max). */
const LONGEST = ["999,999", "999,999.99", "9,999,999.99"];

function estimatedWidth(body: string, size: number): number {
  const digits = body.replace(/[^0-9]/g, "").length;
  const punctuation = body.length - digits;
  const fontSize = size * AMOUNT_MAX_FONT_SCALE;
  return digits * DIGIT_EM * fontSize + punctuation * PUNCTUATION_EM * fontSize + PESO_EM * SYMBOL_SCALE * fontSize + ROW_EXTRAS;
}

describe("amount size", () => {
  // Small iPhone SE, common Android, iPhone 14/15, tall Android, Pro Max.
  const phones = [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 430, height: 932 },
  ];

  it.each(phones)("the longest amount fits a $width-wide phone even at capped large text", ({ width, height }) => {
    // Arrange
    const base = sheetSizing(height).amount;

    // Act + Assert
    for (const body of LONGEST) {
      expect(estimatedWidth(body, amountDigitSize(body, base))).toBeLessThanOrEqual(width - SHEET_GUTTER);
    }
  });

  it("keeps everyday amounts at full size", () => {
    expect(amountDigitSize("1,050", 46)).toBe(46);
    expect(amountDigitSize("12,500", 46)).toBe(46);
  });
});

describe("ExpenseAmount", () => {
  it("caps text scaling on the ₱ and the digits, and lets the row grow", () => {
    // Arrange + Act
    render(<ExpenseAmount text="₱1,250" cents={125_000} baseSize={46} />);

    // Assert
    const digits = screen.getByText("1,250");
    expect(digits.props.maxFontSizeMultiplier).toBe(AMOUNT_MAX_FONT_SCALE);
    expect(digits.props.numberOfLines).toBe(1);
    expect(screen.getByText("₱").props.maxFontSizeMultiplier).toBe(AMOUNT_MAX_FONT_SCALE);
    const row = StyleSheet.flatten(screen.getByLabelText("Amount: 1,250 pesos").props.style);
    expect(row.height).toBeUndefined();
    expect(row.minHeight).toBeGreaterThan(0);
  });
});
