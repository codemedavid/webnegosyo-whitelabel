import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { BusinessDaySection, type SaveCutoffResult } from "./BusinessDaySection";

function renderSection(overrides: Partial<React.ComponentProps<typeof BusinessDaySection>> = {}) {
  const onSave = jest.fn(async (): Promise<SaveCutoffResult> => ({ ok: true, effectiveFrom: "2026-10-25" }));
  render(
    <BusinessDaySection
      currentCutoff={0}
      pending={null}
      isFallback={false}
      canEdit
      lockedReason={null}
      suggestion={null}
      onSave={onSave}
      {...overrides}
    />,
  );
  return onSave;
}

describe("BusinessDaySection", () => {
  it("opens on the store's cutoff with the sentence and no save button", () => {
    renderSection();
    expect(screen.getByRole("radio", { name: "12 AM, midnight" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByText(/Sales from Fri 12:00 AM until Fri 11:59 PM count as Friday\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /End the day at/ })).toBeNull();
  });

  it("previews a chip live and saves it, then says when it starts", async () => {
    const onSave = renderSection();
    fireEvent.press(screen.getByRole("radio", { name: "4 AM" }));
    expect(screen.getByText(/Sales from Fri 4:00 AM until Sat 3:59 AM count as Friday\./)).toBeTruthy();
    expect(screen.getByText("A 1:30 AM sale counts as Friday.")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "End the day at 4:00 AM" })));
    expect(onSave).toHaveBeenCalledWith(240);
    expect(screen.getByText("Starts from Sunday, Oct 25. Past days keep their dates.")).toBeTruthy();
  });

  it("'Other' steps by 15 minutes", () => {
    renderSection({ currentCutoff: 240 });
    fireEvent.press(screen.getByRole("radio", { name: "Other" }));
    fireEvent(screen.getByRole("button", { name: "15 minutes later" }), "pressIn");
    fireEvent(screen.getByRole("button", { name: "15 minutes later" }), "pressOut");
    expect(screen.getByText("4:15 AM")).toBeTruthy();
  });

  it("shows a refusal inline and keeps the choice", async () => {
    renderSection({ onSave: jest.fn(async (): Promise<SaveCutoffResult> => ({ ok: false, error: "Only the owner…" })) });
    fireEvent.press(screen.getByRole("radio", { name: "2 AM" }));
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "End the day at 2:00 AM" })));
    expect(screen.getByText("Only the owner…")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "2 AM" }).props.accessibilityState.selected).toBe(true);
  });

  it("is locked, with the reason, when the schedule could not be read", () => {
    renderSection({ isFallback: true, lockedReason: "Couldn't load your business day setting. Pull down to try again." });
    expect(screen.getByRole("radio", { name: "4 AM" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Couldn't load your business day setting. Pull down to try again.")).toBeTruthy();
  });

  it("says a change that has not started yet", () => {
    renderSection({ pending: { effectiveFrom: "2026-10-28", cutoffMinutes: 240 } });
    expect(screen.getByText("From Wednesday, Oct 28, your day ends at 4:00 AM.")).toBeTruthy();
  });

  it("offers the late-orders suggestion as one tap", async () => {
    const onSave = renderSection({ suggestion: { cutoffMinutes: 180, lateShare: 0.16, lateOrders: 40 } });
    expect(screen.getByText("16% of your orders come after midnight")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Use 3 AM" })));
    expect(onSave).toHaveBeenCalledWith(180);
  });
});
