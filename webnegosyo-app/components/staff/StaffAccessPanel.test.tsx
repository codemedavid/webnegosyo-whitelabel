import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { StaffAccessPanel } from "./StaffAccessPanel";
import type { StaffMember } from "../../lib/staff-service";

function member(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    userId: "ana",
    isOwner: false,
    outletId: null,
    permissions: ["pos", "orders"],
    displayName: "Ana Cruz",
    email: "ana@x.com",
    defaultTab: null,
    createdAt: "2026-01-05T00:00:00Z",
    ...overrides,
  };
}

const handlers = () => ({
  onUpdatePermissions: jest.fn(),
  onUpdateBranch: jest.fn(),
  onUpdateDefaultScreen: jest.fn(),
  onResetPassword: jest.fn(),
  onRemove: jest.fn(),
  onRefuseEmptyPermissions: jest.fn(),
});

const OUTLETS = [{ id: "north", name: "North Branch" }];

it("sends the whole remaining list when a permission is switched off", () => {
  const calls = handlers();
  const screen = render(
    <StaffAccessPanel member={member()} outlets={[]} canAssignBranch busy={false} {...calls} />,
  );
  fireEvent(screen.getByLabelText("POS"), "valueChange", false);
  expect(calls.onUpdatePermissions).toHaveBeenCalledWith(["orders"]);
});

it("refuses to leave an account with nothing at all", () => {
  const calls = handlers();
  const screen = render(
    <StaffAccessPanel
      member={member({ permissions: ["pos"] })}
      outlets={[]}
      canAssignBranch
      busy={false}
      {...calls}
    />,
  );
  fireEvent(screen.getByLabelText("POS"), "valueChange", false);
  expect(calls.onRefuseEmptyPermissions).toHaveBeenCalled();
  expect(calls.onUpdatePermissions).not.toHaveBeenCalled();
});

it("treats full access as every switch on, and a flip as everything but that one", () => {
  const calls = handlers();
  const screen = render(
    <StaffAccessPanel
      member={member({ permissions: null })}
      outlets={[]}
      canAssignBranch
      busy={false}
      {...calls}
    />,
  );
  fireEvent(screen.getByLabelText("POS"), "valueChange", false);
  const [sent] = calls.onUpdatePermissions.mock.calls[0];
  expect(sent).not.toContain("pos");
  expect(sent).toContain("orders");
});

it("does not offer the branch question to someone who cannot move accounts", () => {
  const calls = handlers();
  const screen = render(
    <StaffAccessPanel
      member={member()}
      outlets={OUTLETS}
      canAssignBranch={false}
      busy={false}
      {...calls}
    />,
  );
  expect(screen.queryByText("Works at")).toBeNull();

  const owner = render(
    <StaffAccessPanel member={member()} outlets={OUTLETS} canAssignBranch busy={false} {...calls} />,
  );
  fireEvent.press(owner.getByLabelText("Works at North Branch"));
  expect(calls.onUpdateBranch).toHaveBeenCalledWith("north");
});

it("holds the password back until it is long enough to be accepted", () => {
  const calls = handlers();
  const screen = render(
    <StaffAccessPanel member={member()} outlets={[]} canAssignBranch busy={false} {...calls} />,
  );
  fireEvent.changeText(screen.getByLabelText("New password"), "short");
  fireEvent.press(screen.getByLabelText("Set new password"));
  expect(calls.onResetPassword).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByLabelText("New password"), "longenough1");
  fireEvent.press(screen.getByLabelText("Set new password"));
  expect(calls.onResetPassword).toHaveBeenCalledWith("longenough1");
});

it("offers only the screens this account's grants can actually open", () => {
  const calls = handlers();
  const screen = render(
    <StaffAccessPanel
      member={member({ permissions: ["pos"] })}
      outlets={[]}
      canAssignBranch
      busy={false}
      {...calls}
    />,
  );
  expect(screen.queryByLabelText("Opens on Analytics")).toBeNull();
  expect(screen.getByLabelText("Opens on Let the app decide")).toBeTruthy();
});

it("does not fire a write while another one is still in flight", () => {
  const calls = handlers();
  const screen = render(
    <StaffAccessPanel member={member()} outlets={OUTLETS} canAssignBranch busy {...calls} />,
  );
  fireEvent.press(screen.getByLabelText("Works at North Branch"));
  expect(calls.onUpdateBranch).not.toHaveBeenCalled();
});

it("asks the screen to confirm a removal rather than doing it itself", () => {
  const calls = handlers();
  const screen = render(
    <StaffAccessPanel member={member()} outlets={[]} canAssignBranch busy={false} {...calls} />,
  );
  fireEvent.press(screen.getByLabelText("Remove account"));
  expect(calls.onRemove).toHaveBeenCalled();
});
