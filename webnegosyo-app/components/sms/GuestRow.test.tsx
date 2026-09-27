import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { GuestRow } from "./GuestRow";
import { consentActionFor } from "../../lib/sms/consent-actions";
import { customerReachability } from "../../lib/sms/customer-list";
import type { SmsCustomer } from "../../lib/sms/types";

const customer: SmsCustomer = {
  id: "c1",
  name: "david",
  phone_e164: "+639123456789",
  order_count: 8,
  total_spent: 2529,
  last_order_at: "2026-09-26T10:00:00Z",
  channels_used: ["Dine In"],
  sms_consent: false,
  sms_opt_out: false,
};

function renderRow() {
  const handlers = { onOpen: jest.fn(), onToggleOptOut: jest.fn(), onRecordConsent: jest.fn() };
  const screen = render(
    <GuestRow
      row={{ customer, reachability: customerReachability(customer, []) }}
      consentAction={consentActionFor(customer, [])}
      {...handlers}
    />
  );
  return { screen, handlers };
}

it("opens the guest's profile when the row is tapped", () => {
  const { screen, handlers } = renderRow();

  fireEvent.press(screen.getByLabelText("Open david's details"));

  expect(handlers.onOpen).toHaveBeenCalledTimes(1);
});

it("keeps the consent buttons from opening the profile", () => {
  // The texting controls sit outside the tap target: a mis-navigation on
  // "Do not text" would hide whether the change was saved.
  const { screen, handlers } = renderRow();

  fireEvent.press(screen.getByText("Do not text"));
  fireEvent.press(screen.getByText("They agreed to texts"));

  expect(handlers.onToggleOptOut).toHaveBeenCalledTimes(1);
  expect(handlers.onRecordConsent).toHaveBeenCalledTimes(1);
  expect(handlers.onOpen).not.toHaveBeenCalled();
});
