/**
 * Step 4 "Who is receiving it?" (06 §4.3). What is pinned: the choice maps to
 * exactly the two close_shift arguments (p_remit_to, p_remit_to_safe); "PIN
 * here now" is only offered when it can work (online, the receiver has a PIN);
 * the safe can name who will open it; a still-loading list never reads as
 * "nobody can receive".
 */
import React, { useState } from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { RemitToPicker } from "./RemitToPicker";
import {
  NO_PIN_LINE,
  PIN_OFFLINE_LINE,
  isRemitReady,
  pinBlockedReason,
  remitCloseArgs,
  type CashReceiver,
  type RemitHow,
  type RemitTarget,
} from "./remit-target";

const MARIA: CashReceiver = { userId: "u-maria", name: "Maria Santos", roleLabel: "Owner", presence: "On shift now", hasPin: true };
const BEN: CashReceiver = { userId: "u-ben", name: "Ben Cruz", roleLabel: "Manager", presence: "Last seen 2h ago", hasPin: false };

describe("remit-target", () => {
  it("maps a choice onto close_shift's arguments", () => {
    expect(remitCloseArgs({ kind: "person", userId: "u-maria" })).toEqual({ remitTo: "u-maria", remitToSafe: false });
    expect(remitCloseArgs({ kind: "safe", openerUserId: "u-ben" })).toEqual({ remitTo: "u-ben", remitToSafe: true });
    expect(remitCloseArgs({ kind: "safe", openerUserId: null })).toEqual({ remitTo: null, remitToSafe: true });
    expect(remitCloseArgs(null)).toBeNull();
  });

  it("PIN here now needs a connection and a receiver with a PIN", () => {
    expect(pinBlockedReason(MARIA, false)).toBeNull();
    expect(pinBlockedReason(MARIA, true)).toBe(PIN_OFFLINE_LINE);
    expect(pinBlockedReason(BEN, false)).toBe(NO_PIN_LINE);
    expect(pinBlockedReason({ ...MARIA, hasPin: undefined }, false)).toBeNull();
  });

  it("isRemitReady: someone or the safe is picked, and PIN only when allowed", () => {
    const receivers = [MARIA, BEN];
    expect(isRemitReady(null, "phone", receivers, false)).toBe(false);
    expect(isRemitReady({ kind: "person", userId: "u-maria" }, "pin", receivers, false)).toBe(true);
    expect(isRemitReady({ kind: "person", userId: "u-ben" }, "pin", receivers, false)).toBe(false);
    expect(isRemitReady({ kind: "person", userId: "u-ben" }, "phone", receivers, false)).toBe(true);
    expect(isRemitReady({ kind: "person", userId: "u-gone" }, "phone", receivers, false)).toBe(false);
    expect(isRemitReady({ kind: "safe", openerUserId: null }, "pin", receivers, true)).toBe(true);
  });
});

let latestTarget: RemitTarget | null = null;
let latestHow: RemitHow = "phone";

function Harness(props: { receivers: readonly CashReceiver[] | null; isOffline?: boolean; loadError?: string | null }) {
  const [target, setTarget] = useState<RemitTarget | null>(null);
  const [how, setHow] = useState<RemitHow>("phone");
  return (
    <RemitToPicker
      receivers={props.receivers}
      value={target}
      onChange={(next) => {
        latestTarget = next;
        setTarget(next);
      }}
      how={how}
      onHowChange={(next) => {
        latestHow = next;
        setHow(next);
      }}
      isOffline={props.isOffline}
      loadError={props.loadError}
    />
  );
}

beforeEach(() => {
  latestTarget = null;
  latestHow = "phone";
});

describe("RemitToPicker", () => {
  it("lists receivers with role and presence, then the store safe", () => {
    const { getByText, getByTestId } = render(<Harness receivers={[MARIA, BEN]} />);
    expect(getByText("Who is receiving it?")).toBeTruthy();
    expect(getByText("Owner · On shift now")).toBeTruthy();
    expect(getByText("Manager · Last seen 2h ago")).toBeTruthy();
    expect(getByTestId("remit-to-safe")).toBeTruthy();
  });

  it("picking a person offers Send to their phone | PIN here now", () => {
    const { getByTestId, getByLabelText } = render(<Harness receivers={[MARIA, BEN]} />);
    fireEvent.press(getByTestId("remit-to-u-maria"));
    expect(latestTarget).toEqual({ kind: "person", userId: "u-maria" });
    expect(getByTestId("remit-to-u-maria").props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(getByLabelText("How PIN here now"));
    expect(latestHow).toBe("pin");
  });

  it("a receiver without a PIN can't take PIN here now, and the picker says why", () => {
    const { getByTestId, getByLabelText, getByText } = render(<Harness receivers={[MARIA, BEN]} />);
    fireEvent.press(getByTestId("remit-to-u-ben"));
    fireEvent.press(getByLabelText("How PIN here now"));
    expect(latestHow).toBe("phone");
    expect(getByText(NO_PIN_LINE)).toBeTruthy();
  });

  it("offline: PIN here now is refused with the reason", () => {
    const { getByTestId, getByLabelText, getByText } = render(<Harness receivers={[MARIA]} isOffline />);
    fireEvent.press(getByTestId("remit-to-u-maria"));
    fireEvent.press(getByLabelText("How PIN here now"));
    expect(latestHow).toBe("phone");
    expect(getByText(PIN_OFFLINE_LINE)).toBeTruthy();
  });

  it("the store safe can name who will open it, and has no How", () => {
    const { getByTestId, queryByLabelText, getByText } = render(<Harness receivers={[MARIA, BEN]} />);
    fireEvent.press(getByTestId("remit-to-safe"));
    expect(latestTarget).toEqual({ kind: "safe", openerUserId: null });
    expect(getByText("Who will open the safe?")).toBeTruthy();
    expect(queryByLabelText("How PIN here now")).toBeNull();
    fireEvent.press(getByTestId("safe-opener-u-ben"));
    expect(latestTarget).toEqual({ kind: "safe", openerUserId: "u-ben" });
  });

  it("loading is not 'nobody can receive'; a failed read says so; an empty list still offers the safe", () => {
    const loading = render(<Harness receivers={null} />);
    expect(loading.getByText("Finding who can receive cash…")).toBeTruthy();
    expect(loading.queryByText(/No one here can receive/)).toBeNull();
    const failed = render(<Harness receivers={null} loadError="Couldn't load who can receive cash." />);
    expect(failed.getByText("Couldn't load who can receive cash.")).toBeTruthy();
    expect(failed.getByTestId("remit-to-safe")).toBeTruthy();
    const empty = render(<Harness receivers={[]} />);
    expect(empty.getByText(/No one here can receive cash yet/)).toBeTruthy();
    expect(empty.getByTestId("remit-to-safe")).toBeTruthy();
  });
});
