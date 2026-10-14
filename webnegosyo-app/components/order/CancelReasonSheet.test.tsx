import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { CancelReasonSheet } from "./CancelReasonSheet";

function renderSheet(onConfirm = jest.fn()) {
  render(<CancelReasonSheet visible orderLabel="#22" isBusy={false} onConfirm={onConfirm} onClose={jest.fn()} />);
  return onConfirm;
}

describe("CancelReasonSheet", () => {
  it("keeps the button off, with the reason why, until a reason is picked", () => {
    const onConfirm = renderSheet();
    expect(screen.getByText("Pick a reason first")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Cancel order" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("sends the picked reason and the optional note", () => {
    const onConfirm = renderSheet();
    fireEvent.press(screen.getByRole("radio", { name: "Reason Customer left" }));
    fireEvent.changeText(screen.getByLabelText("Add a detail (optional)"), "Waited 40 minutes");
    fireEvent.press(screen.getByRole("button", { name: "Cancel order" }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Customer left", note: "Waited 40 minutes" });
  });

  it("asks for a detail when the reason is Other", () => {
    const onConfirm = renderSheet();
    fireEvent.press(screen.getByRole("radio", { name: "Reason Other" }));
    expect(screen.getByText("Add a detail for Other")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Cancel order" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
