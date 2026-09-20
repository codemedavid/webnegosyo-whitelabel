import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Rect } from "react-native-svg";

import { TableQrCard } from "./TableQrCard";
import { buildQrModules } from "../../lib/tables/table-qr";

const URL = "https://www.webnegosyo.com/cafe/menu?table=12";

describe("TableQrCard", () => {
  it("draws one rect per dark module", () => {
    render(<TableQrCard label="12" url={URL} />);
    const modules = buildQrModules(URL)!;
    const dark = modules.dark.flat().filter(Boolean).length;
    const rects = screen.UNSAFE_getAllByType(Rect);
    expect(rects).toHaveLength(dark);
    expect(screen.getByText("Table 12")).toBeTruthy();
    expect(screen.getByText(URL)).toBeTruthy();
  });

  it("falls back to the link when the text cannot be encoded", () => {
    render(<TableQrCard label="12" url={"x".repeat(5000)} />);
    expect(screen.queryByTestId("table-qr")).toBeNull();
    expect(screen.getByText(/too long/)).toBeTruthy();
  });
});
