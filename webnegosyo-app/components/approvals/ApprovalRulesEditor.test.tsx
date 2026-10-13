import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import type { ApprovalRules } from "../../lib/approvals/types";
import { ApprovalRulesEditor, type SaveRulesResult } from "./ApprovalRulesEditor";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const RULES: ApprovalRules = {
  directRefundCap: 300,
  managerApproveCap: 1000,
  staffRefundWindow: "same_day",
  discountPctNeedsApproval: 20,
  writeoffCostNeedsApproval: 500,
  expiryMinutes: 30,
  maxPendingPerStaff: 3,
  updatedAt: "2026-10-12T02:00:00.000Z",
  updatedByName: "Lorna Cruz",
};

function renderEditor(onSave = jest.fn(async (): Promise<SaveRulesResult> => ({ ok: true }))) {
  render(
    <ApprovalRulesEditor
      rules={RULES}
      approvers={[{ userId: "m1", name: "Marco Santos", outletId: null }]}
      outletName={() => null}
      isOffline={false}
      onSave={onSave}
      onOpenTeam={jest.fn()}
    />,
  );
  return onSave;
}

describe("ApprovalRulesEditor", () => {
  it("reads as sentences, with who can approve and who changed it last", () => {
    renderEditor();
    expect(screen.getByText("Staff with Refunds can refund up to")).toBeTruthy();
    expect(screen.getByText("₱300")).toBeTruthy();
    expect(screen.getByText("Senior & PWD discounts never do.")).toBeTruthy();
    expect(screen.getByText("Marco Santos")).toBeTruthy();
    expect(screen.getByText("Changes are recorded in Activity. Last changed by Lorna, 12 Oct.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("shows what changed and saves only that", async () => {
    const onSave = renderEditor();
    fireEvent.press(screen.getByRole("button", { name: "Raise Staff refund limit" }));
    expect(screen.getByText("Staff refund limit: ₱300 → ₱400")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Save changes" })));
    expect(onSave).toHaveBeenCalledWith({ directRefundCap: 400 });
    expect(await screen.findByText("Rules saved")).toBeTruthy();
  });

  it("a typed value outside the bounds is refused with the reason", () => {
    renderEditor();
    fireEvent.press(screen.getByRole("button", { name: "Requests close after: 30 min. Tap to type" }));
    fireEvent.changeText(screen.getByLabelText("Requests close after"), "2");
    fireEvent(screen.getByLabelText("Requests close after"), "submitEditing");
    expect(screen.getByText("Between 5 min and 240 min")).toBeTruthy();
  });

  it("keeps the edit and says why when the save fails", async () => {
    renderEditor(jest.fn(async (): Promise<SaveRulesResult> => ({ ok: false, error: "Only the owner can change approval rules." })));
    fireEvent.press(screen.getByRole("button", { name: "Lower Approver limit" }));
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Save changes" })));
    expect(await screen.findByText("Only the owner can change approval rules.")).toBeTruthy();
    expect(screen.getByText("Approver limit: ₱1,000 → ₱500")).toBeTruthy();
  });
});
