/**
 * The app's Lalamove status vocabulary (hand-synced mirror of the web's
 * src/lib/lalamove-status.ts — React Native cannot import from src/).
 *
 * Before this module the card kept its own inline FINAL set that was missing
 * CANCELED (Lalamove's actual v3 spelling) and REJECTED — a rejected or
 * API-cancelled delivery kept showing live Cancel / Priority Fee buttons that
 * could only fail.
 */

import {
  isLalamoveFinal,
  isActiveLalamoveDelivery,
  lalamoveStatusLabel,
  lalamoveBadgeVariant,
} from "./lalamove-status";

describe("isLalamoveFinal", () => {
  it.each(["COMPLETED", "DELIVERED", "CANCELED", "CANCELLED", "REJECTED", "EXPIRED"])(
    "treats %s as the end of the delivery",
    (status) => {
      expect(isLalamoveFinal(status)).toBe(true);
    },
  );

  it("keeps live statuses cancellable and is case-insensitive", () => {
    expect(isLalamoveFinal("ASSIGNING_DRIVER")).toBe(false);
    expect(isLalamoveFinal("ON_GOING")).toBe(false);
    expect(isLalamoveFinal("rejected")).toBe(true);
    expect(isLalamoveFinal(undefined)).toBe(false);
    expect(isLalamoveFinal("")).toBe(false);
  });
});

describe("isActiveLalamoveDelivery", () => {
  it("is true only for a booked, unfinished delivery — this drives auto-sync", () => {
    expect(isActiveLalamoveDelivery("ASSIGNING_DRIVER")).toBe(true);
    expect(isActiveLalamoveDelivery("PICKED_UP")).toBe(true);
    expect(isActiveLalamoveDelivery("COMPLETED")).toBe(false);
    expect(isActiveLalamoveDelivery(undefined)).toBe(false);
  });
});

describe("lalamoveStatusLabel", () => {
  it("turns raw API statuses into words a merchant can read", () => {
    expect(lalamoveStatusLabel("ASSIGNING_DRIVER")).toBe("Finding a driver");
    expect(lalamoveStatusLabel("ON_GOING")).toBe("Driver assigned");
    expect(lalamoveStatusLabel("PICKED_UP")).toBe("On the way");
    expect(lalamoveStatusLabel("COMPLETED")).toBe("Delivered");
    expect(lalamoveStatusLabel("CANCELLED")).toBe("Cancelled");
    expect(lalamoveStatusLabel("REJECTED")).toBe("Rejected");
    expect(lalamoveStatusLabel("EXPIRED")).toBe("Expired");
  });

  it("shows an unknown status raw rather than guessing, and Booked when absent", () => {
    expect(lalamoveStatusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(lalamoveStatusLabel(undefined)).toBe("Booked");
    expect(lalamoveStatusLabel("")).toBe("Booked");
  });
});

describe("lalamoveBadgeVariant", () => {
  it("maps every phase onto an existing Badge variant", () => {
    expect(lalamoveBadgeVariant("ASSIGNING_DRIVER")).toBe("pending");
    expect(lalamoveBadgeVariant("ON_GOING")).toBe("confirmed");
    expect(lalamoveBadgeVariant("PICKED_UP")).toBe("confirmed");
    expect(lalamoveBadgeVariant("DELIVERED")).toBe("delivered");
    expect(lalamoveBadgeVariant("CANCELED")).toBe("cancelled");
    expect(lalamoveBadgeVariant("anything else")).toBe("default");
  });
});
