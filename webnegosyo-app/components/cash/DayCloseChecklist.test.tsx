/**
 * "Before you close" (06 §4.5 step 1, W3.1 get_day_close_status). What is
 * pinned: an open shift is the ONE hard block (an open shift has no count);
 * waiting remittances and unchecked GCash/cards only ask "Close anyway?" and
 * are listed as what was skipped; in a store whose remittances are required,
 * closing over waiting ones needs p_force (with a note); each unmet row has
 * its one-tap fix.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { DayCloseChecklist } from "./DayCloseChecklist";
import { buildDayCloseChecklist, dayCloseReadiness, type DayCloseStatusLike } from "./day-close-checklist";

const CLEAN: DayCloseStatusLike = { openShifts: [], pendingRemittances: [], nonCashUnchecked: [] };

const MESSY: DayCloseStatusLike = {
  openShifts: [{ shiftId: "s-ben", staffName: "Ben", drawerName: "Cashier 2", openedAt: "2026-10-24T10:00:00.000Z", overdue: true }],
  pendingRemittances: [
    { id: "r1", cashierName: "Ana", handedOverCents: 634500, status: "pending" },
    { id: "r2", cashierName: "Carlo", handedOverCents: 512500, status: "disputed" },
  ],
  nonCashUnchecked: [{ shiftId: "s-carlo", staffName: "Carlo", method: "GCash" }],
};

describe("day-close checklist rules", () => {
  it("a clean day: every row ticked, close straight away", () => {
    const rows = buildDayCloseChecklist(CLEAN, { endedShiftCount: 3 });
    expect(rows.map((r) => [r.key, r.tone, r.title])).toEqual([
      ["shifts", "done", "3 shifts ended"],
      ["remittances", "done", "Every remittance is accepted"],
      ["non_cash", "done", "GCash & cards checked"],
    ]);
    expect(dayCloseReadiness(CLEAN, "optional")).toEqual({ canClose: true, needsConfirm: false, needsForce: false, skipped: [] });
  });

  it("an open shift blocks, with End their shift", () => {
    const rows = buildDayCloseChecklist(MESSY, {});
    const shift = rows.find((r) => r.key === "shifts:s-ben");
    expect(shift).toMatchObject({ tone: "block", title: "Ben is still on Cashier 2", action: { kind: "end_shift", targetId: "s-ben", label: "End their shift" } });
    expect(dayCloseReadiness(MESSY, "optional").canClose).toBe(false);
  });

  it("waiting remittances and unchecked GCash ask Close anyway and are listed as skipped", () => {
    const day = { ...MESSY, openShifts: [] };
    const rows = buildDayCloseChecklist(day, {});
    expect(rows.find((r) => r.key === "remittances")).toMatchObject({ tone: "warn", title: "2 remittances not settled", action: { kind: "review_remittances" } });
    expect(rows.find((r) => r.key === "non_cash:s-carlo")).toMatchObject({ tone: "warn", title: "GCash not checked on Carlo's shift", action: { kind: "review_non_cash", targetId: "s-carlo" } });
    expect(dayCloseReadiness(day, "optional")).toEqual({
      canClose: true,
      needsConfirm: true,
      needsForce: false,
      skipped: ["2 remittances not settled", "GCash not checked on Carlo's shift"],
    });
    expect(dayCloseReadiness(day, "required").needsForce).toBe(true);
  });

  it("without a count of ended shifts the row still reads truthfully", () => {
    expect(buildDayCloseChecklist(CLEAN, {})[0].title).toBe("Every shift has ended");
    expect(buildDayCloseChecklist(CLEAN, { endedShiftCount: 1 })[0].title).toBe("1 shift ended");
  });
});

describe("DayCloseChecklist", () => {
  it("names each row with a word, not colour alone, and wires the fixes", () => {
    const onEndShift = jest.fn();
    const onReviewRemittances = jest.fn();
    const onReviewNonCash = jest.fn();
    const { getByText, getByTestId, getByLabelText } = render(
      <DayCloseChecklist status={MESSY} onEndShift={onEndShift} onReviewRemittances={onReviewRemittances} onReviewNonCash={onReviewNonCash} />,
    );
    expect(getByText("Before you close")).toBeTruthy();
    expect(getByLabelText("Needed: Ben is still on Cashier 2")).toBeTruthy();
    expect(getByLabelText("Check: 2 remittances not settled")).toBeTruthy();
    fireEvent.press(getByTestId("checklist-action-shifts:s-ben"));
    fireEvent.press(getByTestId("checklist-action-remittances"));
    fireEvent.press(getByTestId("checklist-action-non_cash:s-carlo"));
    expect(onEndShift).toHaveBeenCalledWith("s-ben");
    expect(onReviewRemittances).toHaveBeenCalled();
    expect(onReviewNonCash).toHaveBeenCalledWith("s-carlo");
  });

  it("a clean day shows ticks and no buttons", () => {
    const { getByLabelText, queryByTestId } = render(
      <DayCloseChecklist status={CLEAN} endedShiftCount={2} onEndShift={jest.fn()} onReviewRemittances={jest.fn()} onReviewNonCash={jest.fn()} />,
    );
    expect(getByLabelText("Done: 2 shifts ended")).toBeTruthy();
    expect(queryByTestId("checklist-action-remittances")).toBeNull();
  });

  it("offline: the fixes are disabled", () => {
    const onEndShift = jest.fn();
    const { getByTestId } = render(
      <DayCloseChecklist status={MESSY} onEndShift={onEndShift} onReviewRemittances={jest.fn()} onReviewNonCash={jest.fn()} isOffline />,
    );
    fireEvent.press(getByTestId("checklist-action-shifts:s-ben"));
    expect(onEndShift).not.toHaveBeenCalled();
  });
});
