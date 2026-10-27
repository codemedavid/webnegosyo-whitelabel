/** A sample frozen day (Sat Oct 24, day ends 4 AM) shared by the day-close tests. */
export const SNAPSHOT = {
  window: { start: "2026-10-23T20:00:00.000Z", end: "2026-10-24T20:00:00.000Z", cutoffMinutes: 240 },
  sales: {
    netCents: 4122000,
    orders: 87,
    discountCents: 12000,
    collectedByMethod: [
      { bucket: "Cash", cents: 2461500 },
      { bucket: "GCash", cents: 984000 },
    ],
    unpaidCents: 0,
    overpaidCents: 0,
  },
  drawers: {
    shifts: [
      {
        shiftId: "s1",
        staff: "Ana",
        drawer: "Cashier 1",
        closeKind: "counted",
        floatCents: 200000,
        expectedCents: 846500,
        countedCents: 834500,
        varianceCents: -12000,
        remittance: { status: "accepted", handedOverCents: 634500, receivedCents: 634500 },
      },
      { shiftId: "s2", staff: "Ben", drawer: "Cashier 2", closeKind: "forced", floatCents: null, expectedCents: 900000, countedCents: null, varianceCents: null, remittance: { status: "pending", handedOverCents: null, receivedCents: null } },
    ],
    totals: { expectedCents: 1746500, countedCents: 834500, varianceCents: -12000, handedOverCents: 634500, receivedCents: 634500, collectedMidShiftCents: 250000 },
  },
  cashToAccountForCents: 884500,
  expenses: { drawerCents: 60000, otherCents: 0 },
  byServicePeriod: [
    { periodId: "p1", name: "Day shift", netCents: 2000000, orders: 40 },
    { periodId: "p2", name: "Night shift", netCents: 2000000, orders: 45 },
  ],
  otherHoursNetCents: 122000,
  recountChanged: [{ shiftId: "s1", staffName: "Ana", firstCents: 0, finalCents: 834500 }],
};
