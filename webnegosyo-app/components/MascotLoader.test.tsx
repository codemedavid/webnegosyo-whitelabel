/**
 * The mascot loader: the owl animation over a bar that only claims progress
 * when a caller can measure it.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { MascotLoader } from "./MascotLoader";

describe("MascotLoader", () => {
  it("shows the mascot animation over an indeterminate sweep by default", () => {
    render(<MascotLoader />);

    expect(screen.getByTestId("mascot-loader-mascot")).toBeTruthy();
    expect(screen.getByTestId("mascot-loader-sweep")).toBeTruthy();
    expect(screen.queryByTestId("mascot-loader-fill")).toBeNull();
    // Nothing on screen says "loading" without a message, so the role does.
    expect(screen.getByRole("progressbar", { name: "Loading" })).toBeTruthy();
  });

  it("fills the bar to a clamped percentage when progress is given", () => {
    render(<MascotLoader progress={1.4} message="Preparing your store" />);

    expect(screen.getByTestId("mascot-loader-fill")).toHaveStyle({ width: "100%" });
    expect(screen.queryByTestId("mascot-loader-sweep")).toBeNull();
    expect(screen.getByRole("progressbar", { name: "Preparing your store" })).toHaveProp(
      "accessibilityValue",
      { min: 0, max: 100, now: 100 },
    );
    expect(screen.getByText("Preparing your store")).toBeTruthy();
  });

  it("reports partial progress as a rounded percentage", () => {
    render(<MascotLoader progress={0.336} />);

    expect(screen.getByTestId("mascot-loader-fill")).toHaveStyle({ width: "33.6%" });
    expect(screen.getByRole("progressbar")).toHaveProp("accessibilityValue", {
      min: 0,
      max: 100,
      now: 34,
    });
  });
});

describe("MascotLoader sizes", () => {
  it("draws the compact mascot smaller than the full one", () => {
    render(
      <>
        <MascotLoader testID="full" />
        <MascotLoader testID="compact" size="compact" />
      </>,
    );

    expect(screen.getByTestId("full-mascot")).toHaveStyle({ width: 180, height: 180 });
    expect(screen.getByTestId("compact-mascot")).toHaveStyle({ width: 120, height: 120 });
  });
});

describe("MascotLoader surfaces", () => {
  it("picks the owl flattened onto a white card when asked", () => {
    render(
      <>
        <MascotLoader testID="bg" />
        <MascotLoader testID="card" surface="card" />
      </>,
    );

    const bgSource = screen.getByTestId("bg-mascot").props.source;
    const cardSource = screen.getByTestId("card-mascot").props.source;
    expect(cardSource).not.toEqual(bgSource);
  });
});
