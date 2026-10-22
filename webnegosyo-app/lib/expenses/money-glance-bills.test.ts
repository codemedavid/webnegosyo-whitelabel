import { billsDue, type Bill, type BillMark, type BillPayment } from "./bill-schedule";
import { BILL_TODAY, RENT_PAID_UP, billMark, billPayment, makeBill } from "./bill-test-fixtures";
import { billGlance } from "./money-glance-bills";

function glanceFor(bills: Bill[], payments: BillPayment[] = [], marks: BillMark[] = [], today = BILL_TODAY) {
  return billGlance(bills, billsDue(bills, { today, payments, marks }), today);
}

const power = makeBill({ id: "bill-power", name: "Kuryente", categoryId: "cat-power", rule: { kind: "monthly", day: 23 }, amountCents: null, remindDaysBefore: 1 });
const powerPaid = [billPayment("2026-08-23", 610_000, "bill-power"), billPayment("2026-09-23", 630_000, "bill-power")];

describe("billGlance", () => {
  test("says nothing when every bill is paid or more than 3 days away", () => {
    expect(glanceFor([makeBill()], [...RENT_PAID_UP])).toBeNull();
  });

  test("a late bill leads, in days, with its amount", () => {
    // Arrange: rent was due on the 20th and is not paid.
    const rent = makeBill({ rule: { kind: "monthly", day: 20 } });
    const paid = [billPayment("2026-08-20"), billPayment("2026-09-20")];

    // Act
    const glance = glanceFor([rent], paid);

    // Assert
    expect(glance).toEqual({ billId: "bill-rent", title: "Rent is 2 days late", detail: "₱15,000", isLate: true });
  });

  test("a bill that changes every time is shown as about its usual amount", () => {
    const glance = glanceFor([power], powerPaid);

    expect(glance).toEqual({ billId: "bill-power", title: "Kuryente is due tomorrow", detail: "about ₱6,200", isLate: false });
  });

  test("counts the other bills still to pay this week", () => {
    // Arrange: power due tomorrow; water due Monday; internet due in 9 days (not this week).
    const water = makeBill({ id: "bill-water", name: "Tubig", rule: { kind: "monthly", day: 26 }, amountCents: 80_000, startsOn: "2026-09-01" });
    const internet = makeBill({ id: "bill-net", name: "Internet", rule: { kind: "monthly", day: 31 }, amountCents: 169_900, startsOn: "2026-09-01" });
    const payments = [
      ...powerPaid,
      billPayment("2026-09-26", 80_000, "bill-water"),
      billPayment("2026-09-30", 169_900, "bill-net"),
    ];

    const glance = glanceFor([water, power, internet], payments);

    expect(glance?.title).toBe("Kuryente is due tomorrow");
    expect(glance?.detail).toBe("about ₱6,200 · 1 more bill this week");
  });

  test("several late months of one bill read as payments, never as 'missed'", () => {
    // Arrange: rent unpaid for September and October.
    const rent = makeBill({ rule: { kind: "monthly", day: 5 } });

    const glance = glanceFor([rent], [billPayment("2026-08-05")]);

    expect(glance).toMatchObject({ title: "Rent is 17 days late", detail: "2 payments · ₱30,000" });
    expect(`${glance?.title} ${glance?.detail}`).not.toMatch(/miss/i);
  });

  test("leaves out a due date the owner snoozed or skipped", () => {
    const rent = makeBill({ rule: { kind: "monthly", day: 20 } });
    const paid = [billPayment("2026-08-20"), billPayment("2026-09-20")];

    expect(glanceFor([rent], paid, [billMark("2026-10-20", "snoozed", "2026-10-23")])).toBeNull();
    expect(glanceFor([rent], paid, [billMark("2026-10-20", "skipped")])).toBeNull();
  });

  test("an amount nobody knows yet still gets a row", () => {
    const fresh = makeBill({ id: "bill-lpg", name: "LPG", amountCents: null, rule: { kind: "monthly", day: 23 }, startsOn: "2026-10-01" });

    expect(glanceFor([fresh])?.detail).toBe("Amount changes each time");
  });
});
