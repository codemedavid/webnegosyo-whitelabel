import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { DEFAULT_CASH_SETTINGS } from "../../lib/cash/settings";
import { BLIND_COUNT_OFF_PLATFORM_NOTE, CashRulesForm, type SaveRulesResult } from "./CashRulesForm";

function renderForm(overrides: Partial<React.ComponentProps<typeof CashRulesForm>> = {}) {
  const onSave = jest.fn(async (): Promise<SaveRulesResult> => ({ ok: true }));
  render(<CashRulesForm settings={DEFAULT_CASH_SETTINGS} canEdit isOffline={false} isPlatformStore onSave={onSave} {...overrides} />);
  return onSave;
}

describe("CashRulesForm", () => {
  it("shows the defaults and no save dock until something changes", () => {
    renderForm();
    expect(screen.getByText("₱20")).toBeTruthy();
    expect(screen.getByLabelText("Blind count").props.value).toBe(false);
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("lists each change and saves only those", async () => {
    const onSave = renderForm();
    fireEvent(screen.getByLabelText("Blind count"), "valueChange", true);
    const raise = screen.getByRole("button", { name: "Raise the reason threshold by 10 pesos" });
    fireEvent(raise, "pressIn");
    fireEvent(raise, "pressOut");
    expect(screen.getByText("Blind count: Off → On")).toBeTruthy();
    expect(screen.getByText("Ask for a reason above: ₱20 → ₱30")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Save changes" })));
    expect(onSave).toHaveBeenCalledWith({ blindClose: true, varianceReasonFromCents: 3000 });
    expect(await screen.findByText("Rules saved")).toBeTruthy();
  });

  it("warns that every register must be updated before blind count", () => {
    renderForm();
    fireEvent(screen.getByLabelText("Blind count"), "valueChange", true);
    expect(screen.getByText(/Update the app on every register first/)).toBeTruthy();
  });

  it("says blind count only hides register totals on a store whose orders are not on the platform", () => {
    renderForm();
    expect(screen.queryByText(BLIND_COUNT_OFF_PLATFORM_NOTE)).toBeNull();
    screen.unmount();
    renderForm({ isPlatformStore: false });
    expect(screen.getByText(BLIND_COUNT_OFF_PLATFORM_NOTE)).toBeTruthy();
  });

  it("keeps Save disabled while offline and says why", () => {
    renderForm({ isOffline: true });
    fireEvent(screen.getByLabelText("Require a shift to sell"), "valueChange", true);
    expect(screen.getByText("You're offline. Connect to save.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" }).props.accessibilityState.disabled).toBe(true);
  });

  it("shows a refusal inline and keeps the draft", async () => {
    renderForm({ onSave: jest.fn(async (): Promise<SaveRulesResult> => ({ ok: false, error: "Not saved." })) });
    fireEvent(screen.getByLabelText("Require a shift to sell"), "valueChange", true);
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Save changes" })));
    expect(screen.getByText("Not saved.")).toBeTruthy();
    expect(screen.getByText("Require a shift to sell: Off → On")).toBeTruthy();
  });

  it("is read-only when the viewer may not edit", () => {
    renderForm({ canEdit: false });
    expect(screen.getByLabelText("Blind count").props.disabled).toBe(true);
  });
});
