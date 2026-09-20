import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AddStaffSheet } from "./AddStaffSheet";

/** The sheet insets itself against the notch, so the test supplies metrics. */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

const OUTLETS = [{ id: "north", name: "North Branch" }];

function setup(overrides: Partial<React.ComponentProps<typeof AddStaffSheet>> = {}) {
  const onCreate = jest.fn();
  const screen = render(
    <AddStaffSheet
      visible
      onClose={jest.fn()}
      onCreate={onCreate}
      busy={false}
      outlets={OUTLETS}
      canAssignBranch
      branchName="Whole store"
      {...overrides}
    />,
    { wrapper: Wrapper },
  );
  return { screen, onCreate };
}

function fillTheForm(screen: ReturnType<typeof render>) {
  fireEvent.changeText(screen.getByLabelText("Display name"), "Maria Santos");
  fireEvent.changeText(screen.getByLabelText("Email"), "maria@example.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "longenough1");
  fireEvent(screen.getByLabelText("POS"), "valueChange", true);
}

it("will not create an account until every answer it needs is there", () => {
  const { screen, onCreate } = setup();
  fireEvent.press(screen.getByLabelText("Create account"));
  expect(onCreate).not.toHaveBeenCalled();

  fillTheForm(screen);
  fireEvent.press(screen.getByLabelText("Create account"));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      displayName: "Maria Santos",
      email: "maria@example.com",
      password: "longenough1",
      permissions: ["pos"],
    }),
  );
});

it("refuses a password too short for the service to accept", () => {
  const { screen, onCreate } = setup();
  fireEvent.changeText(screen.getByLabelText("Display name"), "Maria");
  fireEvent.changeText(screen.getByLabelText("Email"), "maria@example.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "short");
  fireEvent(screen.getByLabelText("POS"), "valueChange", true);
  fireEvent.press(screen.getByLabelText("Create account"));
  expect(onCreate).not.toHaveBeenCalled();
});

it("drops a pinned screen when the permission it was the key to is unticked", () => {
  const { screen, onCreate } = setup();
  fillTheForm(screen);
  fireEvent(screen.getByLabelText("Analytics"), "valueChange", true);
  fireEvent.press(screen.getByLabelText("Opens on Analytics"));

  // Taking Analytics back must not leave a screen selected that the account
  // can no longer open — the service would reject it and nobody would know.
  fireEvent(screen.getByLabelText("Analytics"), "valueChange", false);
  fireEvent.press(screen.getByLabelText("Create account"));
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ defaultTab: null }));
});

it("does not ask a branch admin which branch — they have only one", () => {
  const { screen } = setup({ canAssignBranch: false, branchName: "North Branch" });
  expect(screen.queryByText("Works at")).toBeNull();
  expect(screen.getByText("Joining North Branch")).toBeTruthy();
});

it("offers the branch choice to the owner, and carries it into the draft", () => {
  const { screen, onCreate } = setup();
  fillTheForm(screen);
  fireEvent.press(screen.getByLabelText("Works at North Branch"));
  fireEvent.press(screen.getByLabelText("Create account"));
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ outletId: "north" }));
});
